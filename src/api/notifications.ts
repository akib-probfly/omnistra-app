import { apiFetch } from './client';

export type NotificationType =
  | 'NEW_MESSAGE'
  | 'CONVERSATION_ASSIGNED'
  | 'CONVERSATION_UNASSIGNED'
  | 'INCOMING_CALL'
  | 'CONTACT_EXPORT_READY'
  | 'CAMPAIGN_EXPORT_READY';

export type NotificationEntityType =
  | 'MESSAGE'
  | 'CONVERSATION'
  | 'CALL_SESSION'
  | 'CONTACT_EXPORT'
  | 'CAMPAIGN_EXPORT';

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
};

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: (query: { unreadOnly?: boolean; page?: number; limit?: number }) =>
    ['notifications', 'list', query] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
};

function buildNotificationQueryString(query: { unreadOnly?: boolean; page?: number; limit?: number } = {}) {
  const params: string[] = [];
  if (typeof query.page === 'number') params.push(`page=${query.page}`);
  if (typeof query.limit === 'number') params.push(`limit=${query.limit}`);
  if (typeof query.unreadOnly === 'boolean') params.push(`unreadOnly=${query.unreadOnly ? 'true' : 'false'}`);
  const queryString = params.join('&');
  return queryString ? `?${queryString}` : '';
}

type NotificationDeliveryRecord = {
  id: string;
  notificationId: string;
  workspaceId: string;
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
  seenAt: string | null;
  suppressedReason: string | null;
  createdAt: string;
  updatedAt: string;
  notification: {
    id: string;
    workspaceId: string;
    type: NotificationType;
    entityType: NotificationEntityType;
    entityId: string;
    conversationId: string | null;
    channelId: string | null;
    targetScope: 'WORKSPACE' | 'USER' | 'CONVERSATION_ASSIGNEE';
    title: string;
    body: string;
    metadata: NotificationMetadata;
    dedupeKey: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

function toNotificationListItem(delivery: NotificationDeliveryRecord): NotificationListItem {
  const nested = delivery.notification;
  return {
    id: nested.id,
    notificationId: nested.id,
    workspaceId: delivery.workspaceId,
    type: nested.type,
    entityType: nested.entityType,
    entityId: nested.entityId,
    conversationId: nested.conversationId,
    channelId: nested.channelId,
    title: nested.title,
    body: nested.body,
    metadata: nested.metadata,
    createdAt: nested.createdAt,
    readAt: delivery.readAt,
    isUnread: delivery.readAt == null,
  };
}

export async function fetchNotifications(query: { unreadOnly?: boolean; page?: number; limit?: number } = {}) {
  const response = await apiFetch<{ items: NotificationDeliveryRecord[]; meta: NotificationListResponse['meta'] }>(
    `/notifications${buildNotificationQueryString(query)}`,
    { method: 'GET' },
  );
  return {
    items: (response.items ?? []).map(toNotificationListItem),
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
