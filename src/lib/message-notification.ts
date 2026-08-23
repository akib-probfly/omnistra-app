import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { NotificationCreatedRealtimeEvent } from '../api/notifications';
import { markConversationRead, sendConversationTextMessage } from '../api/inbox';
import { DEFAULT_CHANNEL_ID } from './mobilePushRegistration';
import { parseMobileNotificationData } from './mobile-notification';

export const NEW_MESSAGE_CATEGORY_ID = 'new_message';
export const REPLY_MESSAGE_ACTION_ID = 'reply_message';
export const MARK_READ_ACTION_ID = 'mark_read';

const PRESENTED_LOCALLY_FLAG = 'presentedLocally';

let categoryConfigured = false;

export function isMessageNotificationAction(actionIdentifier: string) {
  return actionIdentifier === REPLY_MESSAGE_ACTION_ID || actionIdentifier === MARK_READ_ACTION_ID;
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
    ]);
  } catch (error) {
    categoryConfigured = false;
    if (__DEV__) console.warn('[message-push] category setup failed', error);
  }
}

function notificationIdForConversation(conversationId: string) {
  return `message:${conversationId}`;
}

function buildContent(payload: NotificationCreatedRealtimeEvent): Notifications.NotificationContentInput {
  return {
    title: payload.title || 'New message',
    body: payload.body || 'Open to reply',
    data: { ...payload, [PRESENTED_LOCALLY_FLAG]: '1' },
    categoryIdentifier: NEW_MESSAGE_CATEGORY_ID,
    sound: 'message.wav',
    ...(Platform.OS === 'android' ? { channelId: DEFAULT_CHANNEL_ID } : {}),
  };
}

/**
 * Show a message notification that the app owns, so Reply / Mark as read are attached.
 * Identifier is per conversation so a newer message replaces the previous banner.
 */
export async function presentIncomingMessageNotification(payload: NotificationCreatedRealtimeEvent) {
  if (payload.type !== 'NEW_MESSAGE' || !payload.conversationId) return;
  await ensureMessageNotificationCategory();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: notificationIdForConversation(payload.conversationId),
      content: buildContent(payload),
      trigger: null,
    });
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

  if (response.actionIdentifier === MARK_READ_ACTION_ID) {
    try {
      await markConversationRead(payload.conversationId);
    } catch (error) {
      if (__DEV__) console.warn('[message-push] mark read failed', error);
    }
    await dismissIncomingMessageNotification(payload.conversationId);
    return true;
  }

  const text = (response.userText ?? '').replace(/\u200B/g, '').trim();
  if (!text) return true;

  try {
    await sendConversationTextMessage(payload.conversationId, text);
    await dismissIncomingMessageNotification(payload.conversationId);
  } catch (error) {
    if (__DEV__) console.warn('[message-push] reply failed', error);
    // Put the banner back so the user can try again without opening the app.
    await presentIncomingMessageNotification(payload);
  }
  return true;
}
