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
import { parseMobileNotificationData } from '../lib/mobile-notification';

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

async function handleRemoteCallPush(rawData: Record<string, unknown>) {
  const event = readCallEvent(rawData);
  const payload = parseMobileNotificationData(rawData);

  if (event === 'ENDED') {
    const callSessionId = typeof rawData.entityId === 'string' ? rawData.entityId : null;
    clearIncomingCallPrompt(callSessionId);
    await dismissIncomingCallNotification(callSessionId);
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
      await handleCallAction(data);
      return;
    }
    await handleRemoteCallPush(readRemoteData(data.data ?? {}));
  } catch (taskError) {
    if (__DEV__) console.warn('[call-push] task failed', taskError);
  }
});

export function registerCallPushTask() {
  void ensureIncomingCallCategory();
  void Notifications.registerTaskAsync(CALL_PUSH_TASK).catch((error) => {
    if (__DEV__) console.warn('[call-push] task registration failed', error);
  });
}
