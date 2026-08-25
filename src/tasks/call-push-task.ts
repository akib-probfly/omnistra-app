import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { declineConversationCall } from '../api/inbox';
import {
  ANSWER_CALL_ACTION_ID,
  DECLINE_CALL_ACTION_ID,
  dismissIncomingCallNotification,
  ensureIncomingCallCategory,
  isIncomingCallPromptExpired,
  presentIncomingCallNotification,
} from '../lib/call-notification';
import { clearIncomingCallPrompt, writeIncomingCallPrompt } from '../lib/incoming-call-prompt';
import {
  ensureMessageNotificationCategory,
  handleMessageNotificationAction,
  presentIncomingMessageNotification,
  dismissDuplicateMessageBanners,
} from '../lib/message-notification';
import { parseMobileNotificationData } from '../lib/mobile-notification';
import { ensureMobilePushChannels } from '../lib/mobilePushRegistration';

export const CALL_PUSH_TASK = 'ZURVIS-CALL-PUSH-TASK';

/**
 * Data-only push field the backend sets on call pushes. 'ENDED' covers answered
 * elsewhere, declined, and missed — anything that should stop the ringing.
 */
type CallPushEvent = 'RINGING' | 'ENDED';

function readCallEvent(data: Record<string, unknown>): CallPushEvent | null {
  const value = typeof data.callEvent === 'string' ? data.callEvent.toUpperCase() : null;
  return value === 'RINGING' || value === 'ENDED' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** FCM delivers data fields flat; Android also mirrors them into a JSON `dataString`. */
function readRemoteData(data: { dataString?: string; [key: string]: unknown }) {
  if (typeof data.dataString === 'string') {
    try {
      const parsed = JSON.parse(data.dataString) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...data, ...(parsed as Record<string, unknown>) };
      }
    } catch {
      // Fall through to the flat fields.
    }
  }
  return data as Record<string, unknown>;
}

/**
 * Expo's background task payload is not a flat FCM map. It may be
 * `{ data }`, `{ data, dataString }`, or `{ notification: { request: { content: { data } } } }`.
 */
function extractRemotePushData(taskData: unknown): Record<string, unknown> {
  const root = asRecord(taskData);
  if (!root) return {};

  const nestedData = asRecord(root.data);
  const notification = asRecord(root.notification);
  const request = asRecord(notification?.request);
  const content = asRecord(request?.content);
  const contentData = asRecord(content?.data);

  return readRemoteData({
    ...root,
    ...nestedData,
    ...contentData,
    ...(typeof root.dataString === 'string' ? { dataString: root.dataString } : {}),
    ...(typeof nestedData?.dataString === 'string'
      ? { dataString: nestedData.dataString }
      : {}),
  });
}

async function handleRemoteCallPush(rawData: Record<string, unknown>) {
  const event = readCallEvent(rawData);
  const payload = parseMobileNotificationData(rawData);

  if (event === 'ENDED') {
    const callSessionId = typeof rawData.entityId === 'string' ? rawData.entityId : null;
    clearIncomingCallPrompt(callSessionId);
    await dismissIncomingCallNotification(callSessionId);
    return;
  }

  if (payload?.type === 'NEW_MESSAGE') {
    await presentIncomingMessageNotification(payload);
    await dismissDuplicateMessageBanners(payload.conversationId ?? '');
    return;
  }

  if (!payload || payload.type !== 'INCOMING_CALL') return;
  if (isIncomingCallPromptExpired(payload)) return;

  // Persisted first: if the process is killed before the user reacts, the app can
  // still restore the ringing call on cold start.
  writeIncomingCallPrompt(payload as Parameters<typeof writeIncomingCallPrompt>[0]);
  await presentIncomingCallNotification(payload as Parameters<typeof presentIncomingCallNotification>[0]);
}

async function handleCallAction(response: Notifications.NotificationResponse) {
  const payload = parseMobileNotificationData(response.notification.request.content.data);
  if (!payload || payload.type !== 'INCOMING_CALL') return;

  if (response.actionIdentifier === DECLINE_CALL_ACTION_ID) {
    clearIncomingCallPrompt(payload.entityId);
    await dismissIncomingCallNotification(payload.entityId);
    if (!payload.conversationId) return;
    try {
      await declineConversationCall({
        conversationId: payload.conversationId,
        callSessionId: payload.entityId,
      });
    } catch (error) {
      if (__DEV__) console.warn('[call-push] decline failed', error);
    }
    return;
  }

  if (response.actionIdentifier === ANSWER_CALL_ACTION_ID) {
    // Answer opens the app; keep the prompt so the call screen appears on launch.
    writeIncomingCallPrompt(payload as Parameters<typeof writeIncomingCallPrompt>[0]);
    await dismissIncomingCallNotification(payload.entityId);
  }
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(CALL_PUSH_TASK, async ({ data, error }) => {
  if (error || !data) return;
  try {
    if ('actionIdentifier' in data) {
      if (await handleMessageNotificationAction(data)) return;
      await handleCallAction(data);
      return;
    }
    await handleRemoteCallPush(extractRemotePushData(data));
  } catch (taskError) {
    if (__DEV__) console.warn('[call-push] task failed', taskError);
  }
});

export function registerCallPushTask() {
  void ensureIncomingCallCategory();
  void ensureMessageNotificationCategory();
  void ensureMobilePushChannels().catch((error) => {
    if (__DEV__) console.warn('[call-push] channel setup failed', error);
  });
  void Notifications.registerTaskAsync(CALL_PUSH_TASK).catch((error) => {
    if (__DEV__) console.warn('[call-push] task registration failed', error);
  });
}
