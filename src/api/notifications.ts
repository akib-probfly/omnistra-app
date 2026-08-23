import { apiFetch } from './client';

export type NotificationType = 'NEW_MESSAGE' | 'CONVERSATION_ASSIGNED' | 'CONVERSATION_UNASSIGNED' | 'INCOMING_CALL' | 'CONTACT_EXPORT_READY' | 'CAMPAIGN_EXPORT_READY';

export type NotificationEntityType = 'MESSAGE' | 'CONVERSATION' | 'CALL_SESSION' | 'CONTACT_EXPORT' | 'CAMPAIGN_EXPORT';

export type NotificationMetadata = Record<string, unknown> | null;

export type NotificationListItem = {
  id: string;
  notificationId: string;
  workspaceId: string;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  conversationId: string | null;
  channelId: string | null;
  title: string;
  body: string;
  metadata: NotificationMetadata;
  createdAt: string;
  readAt: string | null;
  isUnread?: boolean;
};

export type NotificationListResponse = {
  items: NotificationListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    unreadOnly: boolean;
    workspaceId: string | null;
  };
};

export type NotificationCreatedRealtimeEvent = {
  notificationId: string;
  workspaceId: string;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  conversationId: string | null;
  channelId: string | null;
  targetScope: 'WORKSPACE' | 'USER' | 'CONVERSATION_ASSIGNEE';
  title: string;
  body: string;
  createdAt: string;
  metadata: NotificationMetadata;
  recipientUserIds: string[] | null;
  callEvent?: 'RINGING' | 'ENDED';
};

export type NotificationPreferences = {
  soundEnabled: boolean;
  backgroundSoundEnabled: boolean;
  browserNotificationsEnabled: boolean;
  mobilePushNotificationsEnabled: boolean;
  newConversationAlertsEnabled: boolean;
  incomingCallAlertsEnabled: boolean;
  mentionsAndAssignmentsOnly: boolean;
  dailySummaryDigestEnabled: boolean;
};

export type MobilePushPlatform = 'ANDROID' | 'IOS';
export type MobilePushProvider = 'FCM' | 'APNS';
export type MobilePushEnvironment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';

export type RegisterMobilePushDeviceInput = {
  platform: MobilePushPlatform;
  provider: MobilePushProvider;
  token: string;
  deviceId?: string | null;
  appVersion?: string | null;
  buildNumber?: string | null;
  environment: MobilePushEnvironment;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  backgroundSoundEnabled: false,
  browserNotificationsEnabled: false,
  mobilePushNotificationsEnabled: false,
  newConversationAlertsEnabled: true,
  incomingCallAlertsEnabled: true,
  mentionsAndAssignmentsOnly: false,
  dailySummaryDigestEnabled: false,
};

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: (query: { unreadOnly?: boolean; page?: number; limit?: number }) => ['notifications', 'list', query] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  preferences: (workspaceId: string) => ['notifications', 'preferences', workspaceId] as const,
};

function buildNotificationQueryString(query: { unreadOnly?: boolean; page?: number; limit?: number } = {}) {
  const params: string[] = [];
  if (typeof query.page === 'number') params.push(`page=${query.page}`);
  if (typeof query.limit === 'number') params.push(`limit=${query.limit}`);
  if (typeof query.unreadOnly === 'boolean') params.push(`unreadOnly=${query.unreadOnly ? 'true' : 'false'}`);
  const queryString = params.join('&');
  return queryString ? `?${queryString}` : '';
}

type RawNotificationRecord = {
  id?: string;
  notificationId?: string;
  workspaceId?: string;
  type?: NotificationType;
  entityType?: NotificationEntityType;
  entityId?: string;
  conversationId?: string | null;
  channelId?: string | null;
  title?: string;
  body?: string;
  metadata?: NotificationMetadata;
  createdAt?: string;
  readAt?: string | null;
  isUnread?: boolean;
  notification?: RawNotificationRecord | null;
};

/** API returns NotificationDelivery rows with nested `notification`. Handle both shapes safely. */
export function toNotificationListItem(raw: RawNotificationRecord): NotificationListItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const nested = raw.notification && typeof raw.notification === 'object' ? raw.notification : null;
  const source = nested ? { ...raw, ...nested } : raw;
  const notificationId = nested?.id ?? raw.notificationId ?? raw.id;
  if (!notificationId || !source.type || !source.workspaceId) return null;

  const readAt = raw.readAt ?? nested?.readAt ?? null;
  return {
    id: notificationId,
    notificationId,
    workspaceId: source.workspaceId,
    type: source.type,
    entityType: source.entityType ?? 'MESSAGE',
    entityId: source.entityId ?? notificationId,
    conversationId: source.conversationId ?? null,
    channelId: source.channelId ?? null,
    title: source.title ?? 'Notification',
    body: source.body ?? '',
    metadata: source.metadata ?? null,
    createdAt: source.createdAt ?? raw.createdAt ?? new Date().toISOString(),
    readAt,
    isUnread: source.isUnread ?? raw.isUnread ?? readAt == null,
  };
}

export function notificationFromRealtimeEvent(payload: NotificationCreatedRealtimeEvent): NotificationListItem {
  return {
    id: payload.notificationId,
    notificationId: payload.notificationId,
    workspaceId: payload.workspaceId,
    type: payload.type,
    entityType: payload.entityType,
    entityId: payload.entityId,
    conversationId: payload.conversationId,
    channelId: payload.channelId,
    title: payload.title,
    body: payload.body,
    metadata: payload.metadata,
    createdAt: payload.createdAt,
    readAt: null,
    isUnread: true,
  };
}

export async function fetchNotifications(query: { unreadOnly?: boolean; page?: number; limit?: number } = {}) {
  const response = await apiFetch<{
    items?: RawNotificationRecord[];
    meta: NotificationListResponse['meta'];
  }>(`/notifications${buildNotificationQueryString(query)}`, { method: 'GET' });
  const items = (response.items ?? []).map((item) => toNotificationListItem(item)).filter((item): item is NotificationListItem => Boolean(item));

  return {
    items,
    meta: response.meta,
  } as NotificationListResponse;
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const response = await apiFetch<number | { count?: number; unreadCount?: number }>('/notifications/unread-count', { method: 'GET' });
  if (typeof response === 'number') return response;
  return response.count ?? response.unreadCount ?? 0;
}

export async function markNotificationAsRead(notificationId: string) {
  return apiFetch<unknown>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' });
}

export async function markAllNotificationsAsRead() {
  return apiFetch<unknown>('/notifications/read-all', { method: 'POST' });
}

export async function deleteAllNotifications() {
  return apiFetch<unknown>('/notifications/all', { method: 'DELETE' });
}

export async function fetchNotificationPreferences(workspaceId: string) {
  return apiFetch<NotificationPreferences>(`/notifications/preferences?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function updateNotificationPreferences(workspaceId: string, preferences: NotificationPreferences) {
  return apiFetch<NotificationPreferences>('/notifications/preferences', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, ...preferences }),
  });
}

export async function registerMobilePushDevice(input: RegisterMobilePushDeviceInput) {
  return apiFetch<unknown>('/notifications/mobile-devices', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function revokeMobilePushDevice(input: { provider: MobilePushProvider; token: string }) {
  return apiFetch<unknown>('/notifications/mobile-devices', {
    method: 'DELETE',
    body: JSON.stringify(input),
  });
}
