import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CALL_CHANNEL_ID } from './mobilePushRegistration';
import type { IncomingCallPrompt } from './incoming-call-prompt';

export const INCOMING_CALL_CATEGORY_ID = 'incoming_call';
export const ANSWER_CALL_ACTION_ID = 'answer_call';
export const DECLINE_CALL_ACTION_ID = 'decline_call';

/** Call sessions ring for a bounded window; a stale ring is worse than none. */
export const INCOMING_CALL_TTL_MS = 60_000;

let categoryConfigured = false;

/**
 * Answer/Decline buttons on the ringing notification. Answer opens the app so the
 * WebRTC session can be joined; Decline is handled without leaving the lock screen.
 */
export async function ensureIncomingCallCategory() {
  if (categoryConfigured) return;
  categoryConfigured = true;
  try {
    await Notifications.setNotificationCategoryAsync(INCOMING_CALL_CATEGORY_ID, [
      {
        identifier: ANSWER_CALL_ACTION_ID,
        buttonTitle: 'Answer',
        options: { opensAppToForeground: true },
      },
      {
        identifier: DECLINE_CALL_ACTION_ID,
        buttonTitle: 'Decline',
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);
  } catch (error) {
    categoryConfigured = false;
    if (__DEV__) console.warn('[call-push] category setup failed', error);
  }
}

function buildContent(prompt: IncomingCallPrompt): Notifications.NotificationContentInput {
  return {
    title: prompt.title || 'Incoming call',
    body: prompt.body || 'Tap to answer',
    data: { ...prompt },
    categoryIdentifier: INCOMING_CALL_CATEGORY_ID,
    sound: 'call.wav',
    priority: Notifications.AndroidNotificationPriority.MAX,
    sticky: true,
    autoDismiss: false,
    ...(Platform.OS === 'android' ? { channelId: CALL_CHANNEL_ID } : {}),
  };
}

/**
 * Ring the device for a call that arrived while the app was backgrounded or killed.
 * The notification identifier is the call session id so it can be dismissed later.
 */
export async function presentIncomingCallNotification(prompt: IncomingCallPrompt) {
  await ensureIncomingCallCategory();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: prompt.entityId,
      content: buildContent(prompt),
      trigger: null,
    });
  } catch (error) {
    if (__DEV__) console.warn('[call-push] present failed', prompt.entityId, error);
  }
}

/** Stop ringing once the call is answered, declined, missed, or taken on another device. */
export async function dismissIncomingCallNotification(callSessionId?: string | null) {
  try {
    if (callSessionId) {
      await Notifications.dismissNotificationAsync(callSessionId);
      await Notifications.cancelScheduledNotificationAsync(callSessionId);
      return;
    }
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // Already gone, or the notification was never displayed on this device.
  }
}

export function isIncomingCallPromptExpired(prompt: Pick<IncomingCallPrompt, 'createdAt'>) {
  const createdAt = Date.parse(prompt.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt > INCOMING_CALL_TTL_MS;
}
