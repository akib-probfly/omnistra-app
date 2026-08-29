import type { QueryClient } from '@tanstack/react-query';
import type { NotificationCreatedRealtimeEvent, NotificationMetadata, NotificationType, NotificationEntityType } from '../api/notifications';
import { fetchActiveConversationCallSessions } from '../api/inbox';
import { reconnectRealtimeSocket } from '../api/realtime';
import { notificationQueryKeys } from '../api/notifications';
import {
  clearIncomingCallPrompt,
  writeIncomingCallPrompt,
} from './incoming-call-prompt';
import { navigationRef } from '../navigation/navigationRef';

const SUPPORTED_NOTIFICATION_TYPES = new Set<NotificationType>(['NEW_MESSAGE', 'CONVERSATION_ASSIGNED', 'CONVERSATION_UNASSIGNED', 'INCOMING_CALL', 'CONTACT_EXPORT_READY', 'CAMPAIGN_EXPORT_READY']);

const SUPPORTED_ENTITY_TYPES = new Set<NotificationEntityType>(['MESSAGE', 'CONVERSATION', 'CALL_SESSION', 'CONTACT_EXPORT', 'CAMPAIGN_EXPORT']);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeNotificationId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function asNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asSafeId(value: unknown) {
  const candidate = asNonEmptyString(value);
  return candidate && isSafeNotificationId(candidate) ? candidate : null;
}

function asNullableSafeId(value: unknown) {
  if (value === '' || value == null) return null;
  return asSafeId(value);
}

function parseMetadata(value: unknown): NotificationMetadata {
  if (typeof value === 'string') {
    try {
      return parseMetadata(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as NotificationMetadata;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * FCM/Expo may deliver a flat data map, nest it under `data`, or JSON-encode it
 * in `dataString`. Incoming-call handling has to see `type` + `callEvent` on the
 * top-level object or the JS handler treats the ringing FCM banner as unknown
 * and hides it.
 */
export function flattenRemotePushData(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value);
  if (!root) return null;

  const nestedData = asRecord(root.data);
  const notification = asRecord(root.notification);
  const request = asRecord(notification?.request);
  const content = asRecord(request?.content);
  const contentData = asRecord(content?.data);

  const merged: Record<string, unknown> = {
    ...root,
    ...nestedData,
    ...contentData,
  };

  const encoded =
    (typeof merged.dataString === 'string' && merged.dataString)
    || (typeof root.dataString === 'string' && root.dataString)
    || (typeof nestedData?.dataString === 'string' && nestedData.dataString)
    || null;

  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(merged, parsed as Record<string, unknown>);
      }
    } catch {
      // Keep the already-merged flat fields.
    }
  }

  return merged;
}

/** Normalize FCM string data and APNs data into the same trusted shape. */
export function parseMobileNotificationData(value: unknown): NotificationCreatedRealtimeEvent | null {
  const data = flattenRemotePushData(value);
  if (!data) return null;
  const notificationId = asSafeId(data.notificationId);
  const workspaceId = asSafeId(data.workspaceId);
  const type = asNonEmptyString(data.type) as NotificationType | null;
  const entityType = asNonEmptyString(data.entityType) as NotificationEntityType | null;
  const entityId = asSafeId(data.entityId);
  const title = asNonEmptyString(data.title) ?? asNonEmptyString(data.alertTitle);
  const body = asNonEmptyString(data.body) ?? asNonEmptyString(data.alertBody);
  const createdAt = asNonEmptyString(data.createdAt);
  const targetScope = asNonEmptyString(data.targetScope);
  const callEventValue = asNonEmptyString(data.callEvent)?.toUpperCase();
  const callEvent =
    callEventValue === 'RINGING' || callEventValue === 'ENDED'
      ? callEventValue
      : undefined;

  if (
    !notificationId ||
    !workspaceId ||
    !type ||
    !SUPPORTED_NOTIFICATION_TYPES.has(type) ||
    !entityType ||
    !SUPPORTED_ENTITY_TYPES.has(entityType) ||
    !entityId ||
    !title ||
    !body ||
    !createdAt ||
    (targetScope !== 'USER' && targetScope !== 'WORKSPACE' && targetScope !== 'CONVERSATION_ASSIGNEE')
  ) {
    return null;
  }

  return {
    notificationId,
    workspaceId,
    type,
    entityType,
    entityId,
    conversationId: asNullableSafeId(data.conversationId),
    channelId: asNullableSafeId(data.channelId),
    targetScope: targetScope as NotificationCreatedRealtimeEvent['targetScope'],
    title,
    body,
    createdAt,
    metadata: parseMetadata(data.metadata),
    recipientUserIds: null,
    ...(callEvent ? { callEvent } : {}),
  };
}

function metadataString(payload: NotificationCreatedRealtimeEvent, key: string) {
  const metadata = payload.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return asNonEmptyString((metadata as Record<string, unknown>)[key]);
}

function navigateMainTab(params: Record<string, unknown>) {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate('Main', params as never);
  return true;
}

export function navigateFromMobileNotification(payload: NotificationCreatedRealtimeEvent) {
  if (payload.type === 'CONTACT_EXPORT_READY') {
    return navigateMainTab({ screen: 'Contacts' });
  }

  if (payload.type === 'CAMPAIGN_EXPORT_READY') {
    const campaignId = asSafeId(metadataString(payload, 'campaignId'));
    if (!campaignId) return false;
    return navigateMainTab({
      screen: 'Settings',
      params: { screen: 'BroadcastCampaign', params: { campaignId } },
    });
  }

  const conversationId = payload.conversationId;
  if (!conversationId) return false;

  return navigateMainTab({
    screen: 'Inbox',
    params: {
      screen: 'Conversation',
      params: {
        conversationId,
        contactName: metadataString(payload, 'contactDisplayName') ?? metadataString(payload, 'contactPhone') ?? 'Conversation',
        workspaceId: payload.workspaceId,
        channelId: payload.channelId ?? undefined,
        channelType: 'WHATSAPP',
      },
    },
  });
}

export async function reconnectAndRefreshActiveCalls(queryClient: QueryClient, conversationId: string | null) {
  reconnectRealtimeSocket();
  await queryClient.invalidateQueries({
    queryKey: ['active-calls'],
    refetchType: 'active',
  });
  void queryClient.fetchQuery({
    queryKey: ['active-calls'],
    queryFn: () => fetchActiveConversationCallSessions({ limit: 5 }),
    staleTime: 0,
  });
  if (!conversationId) return;
  await queryClient.invalidateQueries({
    queryKey: ['conversation-calls', conversationId],
    refetchType: 'active',
  });
}

/** Refresh the same caches used by realtime when push is the first event after background/killed state. */
export function syncNotificationCaches(queryClient: QueryClient, payload: NotificationCreatedRealtimeEvent, options: { showIncomingCallPrompt?: boolean } = {}) {
  void queryClient.invalidateQueries({
    queryKey: notificationQueryKeys.all,
    refetchType: 'active',
  });
  void queryClient.invalidateQueries({
    queryKey: ['conversations'],
    refetchType: 'active',
  });
  void queryClient.invalidateQueries({
    queryKey: ['inbox-unread-count'],
    refetchType: 'active',
  });

  if (payload.conversationId) {
    void queryClient.invalidateQueries({
      queryKey: ['messages', payload.conversationId],
      refetchType: 'active',
    });
    void queryClient.invalidateQueries({
      queryKey: ['conversation-calls', payload.conversationId],
      refetchType: 'active',
    });
  }

  if (payload.type === 'INCOMING_CALL') {
    if (payload.callEvent === 'ENDED') {
      clearIncomingCallPrompt(payload.entityId);
    } else if (options.showIncomingCallPrompt !== false) {
      writeIncomingCallPrompt(payload as Parameters<typeof writeIncomingCallPrompt>[0]);
    }
    void queryClient.invalidateQueries({
      queryKey: ['active-calls'],
      refetchType: 'active',
    });
  }
}
