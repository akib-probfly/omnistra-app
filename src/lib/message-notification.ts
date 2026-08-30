import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { NotificationCreatedRealtimeEvent } from '../api/notifications';
import { markConversationRead, sendConversationTextMessage } from '../api/inbox';
import { DEFAULT_CHANNEL_ID } from './mobilePushRegistration';
import { parseMobileNotificationData } from './mobile-notification';
import { INCOMING_CALL_CATEGORY_ID } from './call-notification';
import {
  isConversationNotificationsMuted,
  muteConversationNotifications,
} from './muted-conversations';

export const NEW_MESSAGE_CATEGORY_ID = 'zurvis_new_message';
export const REPLY_MESSAGE_ACTION_ID = 'reply_message';
export const MARK_READ_ACTION_ID = 'mark_read';
export const MUTE_MESSAGE_ACTION_ID = 'mute_message';

const PRESENTED_LOCALLY_FLAG = 'presentedLocally';
const SETTLING_REPLY_FLAG = 'settlingDirectReply';
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

/** True while we re-post a Direct Reply banner so Android will drop the spinner. */
export function isSettlingDirectReply(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = (data as Record<string, unknown>)[SETTLING_REPLY_FLAG];
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
 * Expo may still surface a bare "New message" tray item from FCM data
 * (`title`/`body` keys). Keep the local banner (with Reply / Mark as read / Mute)
 * and drop the rest, including ones that land after the first present.
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
        if (category === INCOMING_CALL_CATEGORY_ID) return;
        const payload = parseMobileNotificationData(data);
        if (payload?.type === 'INCOMING_CALL') return;
        const sameConversation = payload?.conversationId === conversationId;
        const bareNewMessage =
          isBareExpoMessageBanner(data, title, body, category) ||
          (title === 'New message' || body === 'New message');
        if (!sameConversation && !bareNewMessage) return;
        if (payload && payload.type !== 'NEW_MESSAGE' && !bareNewMessage) return;
        await Notifications.dismissNotificationAsync(identifier).catch(() => {});
      }),
    );
  } catch {
    // Presented-notification APIs are unavailable in some development runtimes.
  }
}

export function dismissDuplicateMessageBannersSoon(conversationId: string) {
  void dismissDuplicateMessageBanners(conversationId);
  setTimeout(() => {
    void dismissDuplicateMessageBanners(conversationId);
  }, 600);
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
    dismissDuplicateMessageBannersSoon(payload.conversationId);
  } catch (error) {
    if (__DEV__) console.warn('[message-push] present failed', payload.conversationId, error);
  }
}

function bannerIdentifiers(conversationId: string, extraIdentifier?: string) {
  const identifiers = new Set<string>([notificationIdForConversation(conversationId)]);
  if (extraIdentifier) identifiers.add(extraIdentifier);
  return [...identifiers];
}

export async function dismissIncomingMessageNotification(
  conversationId?: string | null,
  extraIdentifier?: string,
) {
  if (!conversationId) return;
  try {
    await Promise.all(
      bannerIdentifiers(conversationId, extraIdentifier).map(async (identifier) => {
        await Notifications.dismissNotificationAsync(identifier).catch(() => {});
        await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
      }),
    );
  } catch {
    // Already gone, or never displayed on this device.
  }
}

function withSettlingFlag(content: Notifications.NotificationContentInput): Notifications.NotificationContentInput {
  const data = content.data && typeof content.data === 'object' && !Array.isArray(content.data)
    ? content.data as Record<string, unknown>
    : {};
  return {
    ...content,
    sound: false,
    priority: Notifications.AndroidNotificationPriority.MIN,
    data: { ...data, [PRESENTED_LOCALLY_FLAG]: '1', [SETTLING_REPLY_FLAG]: '1' },
  };
}

async function replaceMessageBanners(
  conversationId: string,
  extraIdentifier: string | undefined,
  content: Notifications.NotificationContentInput,
) {
  await Promise.all(
    bannerIdentifiers(conversationId, extraIdentifier).map((identifier) =>
      Notifications.scheduleNotificationAsync({
        identifier,
        content,
        trigger: null,
      }).catch(() => {}),
    ),
  );
}

/**
 * Android Direct Reply keeps a spinner until the same notification id is posted
 * again. Cancel alone is ignored. iOS has no spinner, so leave its path unchanged.
 */
async function settleDirectReplyNotification(
  response: Notifications.NotificationResponse,
  payload: NotificationCreatedRealtimeEvent,
  options: { replyText?: string; restore: boolean; dismiss: boolean },
) {
  const conversationId = payload.conversationId;
  if (!conversationId) return;

  const extraIdentifier = response.notification.request.identifier;
  if (Platform.OS !== 'android') {
    if (options.restore) {
      await presentIncomingMessageNotification(payload);
      return;
    }
    if (options.dismiss) {
      await dismissIncomingMessageNotification(conversationId, extraIdentifier);
    }
    return;
  }

  if (options.restore) {
    await presentIncomingMessageNotification(payload);
    const canonicalId = notificationIdForConversation(conversationId);
    if (extraIdentifier && extraIdentifier !== canonicalId) {
      await Notifications.scheduleNotificationAsync({
        identifier: extraIdentifier,
        content: withSettlingFlag(buildContent(payload)),
        trigger: null,
      }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 300));
      await Notifications.dismissNotificationAsync(extraIdentifier).catch(() => {});
    }
    return;
  }

  const content = withSettlingFlag({
    ...buildContent(payload),
    body: options.replyText ? `You: ${options.replyText}` : (payload.body || 'Open to reply'),
  });
  await replaceMessageBanners(conversationId, extraIdentifier, content);

  if (!options.dismiss) return;
  await new Promise((resolve) => setTimeout(resolve, 300));
  await dismissIncomingMessageNotification(conversationId, extraIdentifier);
}

export async function handleMessageNotificationAction(response: Notifications.NotificationResponse) {
  if (!isMessageNotificationAction(response.actionIdentifier)) return false;

  const payload = parseMobileNotificationData(response.notification.request.content.data);
  if (!payload || payload.type !== 'NEW_MESSAGE' || !payload.conversationId) return false;

  if (response.actionIdentifier === MUTE_MESSAGE_ACTION_ID) {
    await muteConversationNotifications(payload.conversationId);
    await dismissIncomingMessageNotification(
      payload.conversationId,
      response.notification.request.identifier,
    );
    return true;
  }

  if (response.actionIdentifier === MARK_READ_ACTION_ID) {
    try {
      await markConversationRead(payload.conversationId);
    } catch (error) {
      if (__DEV__) console.warn('[message-push] mark read failed', error);
    }
    await dismissIncomingMessageNotification(
      payload.conversationId,
      response.notification.request.identifier,
    );
    return true;
  }

  const text = readReplyText(response);
  if (!text) {
    // Clear the Android spinner but keep the banner, matching the previous no-op.
    await settleDirectReplyNotification(response, payload, { restore: false, dismiss: false });
    return true;
  }

  try {
    await sendConversationTextMessage(payload.conversationId, text);
    await settleDirectReplyNotification(response, payload, {
      replyText: text,
      restore: false,
      dismiss: true,
    });
  } catch (error) {
    if (__DEV__) console.warn('[message-push] reply failed', error);
    await settleDirectReplyNotification(response, payload, { restore: true, dismiss: false });
  }
  return true;
}
