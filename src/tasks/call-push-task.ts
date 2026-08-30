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
  dismissRemoteIncomingCallBanners,
} from '../lib/call-notification';
import {
  clearIncomingCallPrompt,
  writeIncomingCallPrompt,
} from '../lib/incoming-call-prompt';
import {
  ensureMessageNotificationCategory,
  handleMessageNotificationAction,
  presentIncomingMessageNotification,
  dismissDuplicateMessageBannersSoon,
} from '../lib/message-notification';
import {
  parseMobileNotificationData,
  flattenRemotePushData,
  reportMobilePushInteraction,
} from '../lib/mobile-notification';
import { ensureMobilePushChannels } from '../lib/mobilePushRegistration';

export const CALL_PUSH_TASK = 'ZURVIS-CALL-PUSH-TASK';

type CallPushEvent = 'RINGING' | 'ENDED';
let taskRegistrationPromise: Promise<void> | null = null;

function readCallEvent(data: Record<string, unknown>): CallPushEvent | null {
  const value =
    typeof data.callEvent === 'string' ? data.callEvent.toUpperCase() : null;
  return value === 'RINGING' || value === 'ENDED' ? value : null;
}

async function handleRemoteCallPush(rawData: Record<string, unknown>) {
  const event = readCallEvent(rawData);
  const payload = parseMobileNotificationData(rawData);

  if (payload?.type === 'INCOMING_CALL' && payload.callEvent) {
    reportMobilePushInteraction(payload, 'RECEIVED');
  }

  if (event === 'ENDED') {
    const callSessionId =
      typeof rawData.entityId === 'string' ? rawData.entityId : null;
    clearIncomingCallPrompt(callSessionId);
    await dismissIncomingCallNotification(callSessionId);
    if (payload?.type === 'INCOMING_CALL') {
      reportMobilePushInteraction(payload, 'DISMISSED');
    }
    return;
  }

  if (payload?.type === 'NEW_MESSAGE') {
    await presentIncomingMessageNotification(payload);
    dismissDuplicateMessageBannersSoon(payload.conversationId ?? '');
    return;
  }

  if (!payload || payload.type !== 'INCOMING_CALL') return;
  if (isIncomingCallPromptExpired(payload)) return;

  // Persisted first: if the process is killed before the user reacts, the app can
  // still restore the ringing call on cold start.
  await writeIncomingCallPrompt(
    payload as Parameters<typeof writeIncomingCallPrompt>[0],
  );
  await ensureMobilePushChannels().catch(() => {});
  const presented = await presentIncomingCallNotification(
    payload as Parameters<typeof presentIncomingCallNotification>[0],
  );
  if (presented) {
    reportMobilePushInteraction(payload, 'PRESENTED');
    await dismissRemoteIncomingCallBanners(payload.entityId);
  }
}

async function handleCallAction(response: Notifications.NotificationResponse) {
  const payload = parseMobileNotificationData(
    response.notification.request.content.data,
  );
  if (!payload || payload.type !== 'INCOMING_CALL') return;
  reportMobilePushInteraction(payload, 'ACTIONED', response.actionIdentifier);

  if (response.actionIdentifier === DECLINE_CALL_ACTION_ID) {
    clearIncomingCallPrompt(payload.entityId);
    await dismissIncomingCallNotification(payload.entityId);
    reportMobilePushInteraction(
      payload,
      'DISMISSED',
      response.actionIdentifier,
    );
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
    await writeIncomingCallPrompt(
      payload as Parameters<typeof writeIncomingCallPrompt>[0],
    );
    await dismissIncomingCallNotification(payload.entityId);
  }
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  CALL_PUSH_TASK,
  async ({ data, error }) => {
    if (error || !data) return;
    try {
      if ('actionIdentifier' in data) {
        if (await handleMessageNotificationAction(data)) return;
        await handleCallAction(data);
        return;
      }
      await handleRemoteCallPush(flattenRemotePushData(data) ?? {});
    } catch (taskError) {
      if (__DEV__) console.warn('[call-push] task failed', taskError);
    }
  },
);

export function registerCallPushTask() {
  if (!taskRegistrationPromise) {
    taskRegistrationPromise = (async () => {
      // Complete native channel/category setup before registering the task so a
      // cold-start task cannot race its first local notification.
      await ensureIncomingCallCategory();
      await ensureMessageNotificationCategory();
      await ensureMobilePushChannels();
      await Notifications.registerTaskAsync(CALL_PUSH_TASK);
    })().catch((error) => {
      taskRegistrationPromise = null;
      if (__DEV__) console.warn('[call-push] task setup failed', error);
    });
  }
  return taskRegistrationPromise;
}
