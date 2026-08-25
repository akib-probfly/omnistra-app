import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { NotificationCreatedRealtimeEvent } from '../api/notifications';
import { markConversationRead, sendConversationTextMessage } from '../api/inbox';
import { DEFAULT_CHANNEL_ID } from './mobilePushRegistration';
import { parseMobileNotificationData } from './mobile-notification';
import {
  isConversationNotificationsMuted,
  muteConversationNotifications,
} from './muted-conversations';

export const NEW_MESSAGE_CATEGORY_ID = 'zurvis_new_message';
export const REPLY_MESSAGE_ACTION_ID = 'reply_message';
export const MARK_READ_ACTION_ID = 'mark_read';
export const MUTE_MESSAGE_ACTION_ID = 'mute_message';

const PRESENTED_LOCALLY_FLAG = 'presentedLocally';
const LEGACY_CATEGORY_ID = 'new_message';

let categoryConfigured = false;

export function isMessageNotificationAction(actionIdentifier: string) {
  return (
    actionIdentifier === REPLY_MESSAGE_ACTION_ID
    || actionIdentifier === MARK_READ_ACTION_ID
    || actionIdentifier === MUTE_MESSAGE_ACTION_ID
  );
}

export function wasPresentedLocally(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = (data as Record<string, unknown>)[PRESENTED_LOCALLY_FLAG];
  return value === '1' || value === true;
}

export async function ensureMessageNotificationCategory() {
  if (categoryConfigured) return;
  categoryConfigured = true;
  try {
    await Notifications.deleteNotificationCategoryAsync(LEGACY_CATEGORY_ID).catch(() => {});
    await Notifications.setNotificationCategoryAsync(NEW_MESSAGE_CATEGORY_ID, [
      {
        identifier: REPLY_MESSAGE_ACTION_ID,
        buttonTitle: 'Reply',
        options: { opensAppToForeground: false },
        textInput: {
          placeholder: 'Reply',
          submitButtonTitle: 'Send',
        },
      },
      {
        identifier: MARK_READ_ACTION_ID,
        buttonTitle: 'Mark as read',
        options: { opensAppToForeground: false },
      },
      {
        identifier: MUTE_MESSAGE_ACTION_ID,
        buttonTitle: 'Mute',
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (error) {
    categoryConfigured = false;
    if (__DEV__) console.warn('[message-push] category setup failed', error);
  }
}

function readReplyText(response: Notifications.NotificationResponse) {
  const direct = (response.userText ?? '').replace(/\u200B/g, '').trim();
  if (direct) return direct;
  const data = response.notification.request.content.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const nested = (data as Record<string, unknown>).userText;
  return typeof nested === 'string' ? nested.replace(/\u200B/g, '').trim() : '';
}

function notificationIdForConversation(conversationId: string) {
  return `message:${conversationId}`;
}

function isLocalMessageBanner(identifier: string, data: unknown) {
  return identifier.startsWith('message:') || wasPresentedLocally(data);
}

/** Bare Expo tray item from FCM data `title`/`body` — title only, no message preview. */
function isBareExpoMessageBanner(
  data: unknown,
  title: string,
  body: string,
  categoryIdentifier?: string | null,
) {
  if (categoryIdentifier === NEW_MESSAGE_CATEGORY_ID) return false;
  if (wasPresentedLocally(data)) return false;
  if (title === 'New message' && !body) return true;
  const payload = parseMobileNotificationData(data);
  return payload?.type === 'NEW_MESSAGE';
}

/**
 * Expo may still surface a bare "New message" tray item from FCM data.
 * Keep the local banner (with Reply / Mark as read / Mute) and drop the rest.
 */
export async function dismissDuplicateMessageBanners(conversationId: string) {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented.map(async (notification) => {
        const identifier = notification.request.identifier;
        const data = notification.request.content.data;
        if (isLocalMessageBanner(identifier, data)) return;

        const title = notification.request.content.title?.trim() ?? '';
        const body = notification.request.content.body?.trim() ?? '';
        const category = notification.request.content.categoryIdentifier;
        const payload = parseMobileNotificationData(data);
        const sameConversation = payload?.conversationId === conversationId;
        const bareNewMessage =
          isBareExpoMessageBanner(data, title, body, category) ||
          title === 'New message' ||
          body === 'New message';
        if (!sameConversation && !bareNewMessage) return;
        await Notifications.dismissNotificationAsync(identifier).catch(() => {});
      }),
    );
  } catch {
    // Presented-notification APIs are unavailable in some development runtimes.
  }
}

function buildContent(payload: NotificationCreatedRealtimeEvent): Notifications.NotificationContentInput {
  return {
    title: payload.title || 'New message',
    body: payload.body || 'Open to reply',
    data: { ...payload, [PRESENTED_LOCALLY_FLAG]: '1' },
    categoryIdentifier: NEW_MESSAGE_CATEGORY_ID,
    sound: 'message.wav',
    color: '#1d4ed8',
    priority: Notifications.AndroidNotificationPriority.HIGH,
    ...(Platform.OS === 'android' ? { channelId: DEFAULT_CHANNEL_ID } : {}),
  };
}

/**
 * Show a message notification the app owns so Reply / Mark as read / Mute are attached.
 * Identifier is per conversation so a newer message replaces the previous banner.
 */
export async function presentIncomingMessageNotification(payload: NotificationCreatedRealtimeEvent) {
  if (payload.type !== 'NEW_MESSAGE' || !payload.conversationId) return;
  if (await isConversationNotificationsMuted(payload.conversationId)) return;
  await ensureMessageNotificationCategory();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: notificationIdForConversation(payload.conversationId),
      content: buildContent(payload),
      trigger: null,
    });
    await dismissDuplicateMessageBanners(payload.conversationId);
  } catch (error) {
    if (__DEV__) console.warn('[message-push] present failed', payload.conversationId, error);
  }
}

export async function dismissIncomingMessageNotification(conversationId?: string | null) {
  if (!conversationId) return;
  try {
    await Notifications.dismissNotificationAsync(notificationIdForConversation(conversationId));
    await Notifications.cancelScheduledNotificationAsync(notificationIdForConversation(conversationId));
  } catch {
    // Already gone, or never displayed on this device.
  }
}

export async function handleMessageNotificationAction(response: Notifications.NotificationResponse) {
  if (!isMessageNotificationAction(response.actionIdentifier)) return false;

  const payload = parseMobileNotificationData(response.notification.request.content.data);
  if (!payload || payload.type !== 'NEW_MESSAGE' || !payload.conversationId) return false;

  if (response.actionIdentifier === MUTE_MESSAGE_ACTION_ID) {
    await muteConversationNotifications(payload.conversationId);
    await dismissIncomingMessageNotification(payload.conversationId);
    return true;
  }

  if (response.actionIdentifier === MARK_READ_ACTION_ID) {
    try {
      await markConversationRead(payload.conversationId);
    } catch (error) {
      if (__DEV__) console.warn('[message-push] mark read failed', error);
    }
    await dismissIncomingMessageNotification(payload.conversationId);
    return true;
  }

  const text = readReplyText(response);
  if (!text) return true;

  try {
    await sendConversationTextMessage(payload.conversationId, text);
    await dismissIncomingMessageNotification(payload.conversationId);
  } catch (error) {
    if (__DEV__) console.warn('[message-push] reply failed', error);
    await presentIncomingMessageNotification(payload);
  }
  return true;
}
