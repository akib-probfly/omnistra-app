import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { CALL_CHANNEL_ID } from './mobilePushRegistration';
import type { IncomingCallPrompt } from './incoming-call-prompt';
import { startIncomingCallRingtone, stopIncomingCallRingtone } from './notificationSound';

export const INCOMING_CALL_CATEGORY_ID = 'zurvis_incoming_call';
export const ANSWER_CALL_ACTION_ID = 'answer_call';
export const DECLINE_CALL_ACTION_ID = 'decline_call';
const LEGACY_CATEGORY_ID = 'incoming_call';

/** Match the FCM RINGING ttl so a delayed push is still shown. */
export const INCOMING_CALL_TTL_MS = 90_000;

let categoryConfigured = false;

function contactLabel(prompt: IncomingCallPrompt) {
  const metadata = prompt.metadata && typeof prompt.metadata === 'object' && !Array.isArray(prompt.metadata)
    ? prompt.metadata as Record<string, unknown>
    : null;
  const name = typeof metadata?.contactDisplayName === 'string' ? metadata.contactDisplayName.trim() : '';
  const phone = typeof metadata?.contactPhone === 'string' ? metadata.contactPhone.trim() : '';
  return name || phone || prompt.title?.replace(/\s+called you$/i, '').trim() || 'Incoming call';
}

function callSubtitle(prompt: IncomingCallPrompt) {
  const metadata = prompt.metadata && typeof prompt.metadata === 'object' && !Array.isArray(prompt.metadata)
    ? prompt.metadata as Record<string, unknown>
    : null;
  const channel = typeof metadata?.channelName === 'string' ? metadata.channelName.trim() : '';
  return channel ? `Incoming voice call · ${channel}` : 'Incoming voice call';
}

/**
 * Answer/Decline buttons on the ringing notification. Answer opens the app so the
 * WebRTC session can be joined; Decline is handled without leaving the lock screen.
 */
export async function ensureIncomingCallCategory() {
  if (categoryConfigured) return;
  categoryConfigured = true;
  try {
    await Notifications.deleteNotificationCategoryAsync(LEGACY_CATEGORY_ID).catch(() => {});
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
    title: contactLabel(prompt),
    body: callSubtitle(prompt),
    data: { ...prompt, presentedLocally: '1' },
    categoryIdentifier: INCOMING_CALL_CATEGORY_ID,
    sound: 'call.wav',
    color: '#1d4ed8',
    priority: Notifications.AndroidNotificationPriority.MAX,
    sticky: true,
    autoDismiss: false,
    vibrate: [0, 1000, 500, 1000, 500, 1000],
    interruptionLevel: 'timeSensitive',
    ...(Platform.OS === 'android' ? { channelId: CALL_CHANNEL_ID } : {}),
  };
}

/**
 * Ring the device for a call that arrived while the app was backgrounded or killed.
 * The notification identifier is the call session id so it can be dismissed later.
 */
export async function presentIncomingCallNotification(prompt: IncomingCallPrompt): Promise<boolean> {
  if (prompt.callEvent === 'ENDED') return false;
  await ensureIncomingCallCategory();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: prompt.entityId,
      content: buildContent(prompt),
      trigger: null,
    });
    if (AppState.currentState !== 'active') {
      void startIncomingCallRingtone();
    }
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[call-push] present failed', prompt.entityId, error);
    return false;
  }
}

/** Drop the OS/FCM/APNs copy after the local Answer/Decline banner is up. */
export async function dismissRemoteIncomingCallBanners(callSessionId: string) {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented.map(async (notification) => {
        const identifier = notification.request.identifier;
        if (identifier === callSessionId) return;
        const data = notification.request.content.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const flag = (data as Record<string, unknown>).presentedLocally;
          if (flag === '1' || flag === true) return;
        }
        const category = notification.request.content.categoryIdentifier;
        const type =
          data && typeof data === 'object' && !Array.isArray(data)
            ? (data as Record<string, unknown>).type
            : null;
        const entityId =
          data && typeof data === 'object' && !Array.isArray(data)
            ? (data as Record<string, unknown>).entityId
            : null;
        if (
          category !== INCOMING_CALL_CATEGORY_ID &&
          type !== 'INCOMING_CALL' &&
          entityId !== callSessionId
        ) {
          return;
        }
        await Notifications.dismissNotificationAsync(identifier).catch(() => {});
      }),
    );
  } catch {
    // Presented-notification APIs are unavailable in some development runtimes.
  }
}

/** Stop ringing once the call is answered, declined, missed, or taken on another device. */
export async function dismissIncomingCallNotification(callSessionId?: string | null) {
  stopIncomingCallRingtone();
  if (!callSessionId) return;
  try {
    await Notifications.dismissNotificationAsync(callSessionId);
    await Notifications.cancelScheduledNotificationAsync(callSessionId);
  } catch {
    // Already gone, or the notification was never displayed on this device.
  }
}

export function isIncomingCallPromptExpired(prompt: Pick<IncomingCallPrompt, 'createdAt'>) {
  const createdAt = Date.parse(prompt.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt > INCOMING_CALL_TTL_MS;
}
