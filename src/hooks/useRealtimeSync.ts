import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createRealtimeSocket, setRealtimeConnectionStatus, getActiveConversationId } from '../api/realtime';
import { latestAccessToken } from '../api/client';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationFromRealtimeEvent,
  notificationQueryKeys,
  type NotificationCreatedRealtimeEvent,
  type NotificationListResponse,
  type NotificationPreferences,
} from '../api/notifications';
import { shouldSuppressRealtimeMessageRefresh } from '../lib/inbox-realtime-suppression';
import { playNotificationSound } from '../lib/notificationSound';
import { writeIncomingCallPrompt } from '../lib/incoming-call-prompt';
import { useNotificationPreferences } from './useNotificationPreferences';

const REALTIME_READY_EVENT = 'realtime.ready';
const REALTIME_CONVERSATION_UPDATED_EVENT = 'conversation.updated';
const REALTIME_MESSAGE_CREATED_EVENT = 'message.created';
const REALTIME_CALL_SESSION_UPDATED_EVENT = 'call.session.updated';
const REALTIME_NOTIFICATION_CREATED_EVENT = 'notification.created';

type ConversationUpdatedEvent = {
  workspaceId: string;
  conversationId: string;
  messageId: string | null;
  createdConversation: boolean;
  createdMessage: boolean;
  messageDeliveryStatus?: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  messageFailureReason?: string | null;
  occurredAt: string;
};
type MessageCreatedEvent = { workspaceId: string; conversationId: string; messageId: string; createdAt: string };
type CallSessionUpdatedEvent = { workspaceId: string; conversationId: string; callSessionId: string; status: string };
type NotificationCreatedEvent = NotificationCreatedRealtimeEvent;

const handledNotificationIds = new Set<string>();

const pendingInvalidations = new Map<string, ReturnType<typeof setTimeout>>();

function schedule(key: string, invalidate: () => void, delay: number) {
  const existing = pendingInvalidations.get(key);
  if (existing) clearTimeout(existing);
  pendingInvalidations.set(key, setTimeout(() => {
    pendingInvalidations.delete(key);
    invalidate();
  }, delay));
}

function patchConversationMessageStatus(
  queryClient: ReturnType<typeof useQueryClient>,
  payload: ConversationUpdatedEvent,
) {
  if (!payload.messageId || !payload.messageDeliveryStatus) return;

  const deliveryStatus = payload.messageDeliveryStatus;
  queryClient.setQueriesData<any>({ queryKey: ['messages', payload.conversationId] }, (current: any) => {
    if (!current || !Array.isArray(current.items)) return current;
    let changed = false;
    const items = current.items.map((message: any) => {
      if (message.id !== payload.messageId && message.metadata?.serverId !== payload.messageId) {
        return message;
      }
      changed = true;
      return {
        ...message,
        deliveryStatus,
        failureReason: payload.messageFailureReason ?? message.failureReason ?? null,
      };
    });
    return changed ? { ...current, items } : current;
  });
}

function refreshConversationMessages(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  delay: number,
) {
  schedule(`messages:${conversationId}`, () => {
    // Force an active refetch — invalidate alone can no-op against a warm staleTime cache
    // when the open thread was just patched by the local send response.
    void queryClient.refetchQueries({ queryKey: ['messages', conversationId], type: 'active' });
  }, delay);
}

function invalidateInboxQueries(queryClient: ReturnType<typeof useQueryClient>, delay: number) {
  // Stable key so rapid realtime events debounce instead of stacking.
  // Only refetch observers that are currently mounted (not every cached filter/page).
  schedule('inbox', () => {
    void queryClient.invalidateQueries({ queryKey: ['conversations'], refetchType: 'active' });
    void queryClient.invalidateQueries({ queryKey: ['conversation-count'], refetchType: 'active' });
    void queryClient.invalidateQueries({ queryKey: ['inbox-unread-count'], refetchType: 'active' });
  }, delay);
}

type CachedConversationList = { pages: Array<{ items?: Array<{ id: string; unreadCount?: number }> }> };

function getCachedConversationUnreadCount(queryClient: ReturnType<typeof useQueryClient>, conversationId: string) {
  let unreadCount = 0;
  queryClient.getQueriesData<CachedConversationList>({ queryKey: ['conversations'] }).forEach(([, data]) => {
    data?.pages?.forEach((page) => {
      page.items?.forEach((conversation) => {
        if (conversation.id === conversationId) unreadCount = Math.max(unreadCount, conversation.unreadCount ?? 0);
      });
    });
  });
  return unreadCount;
}

function incrementConversationUnreadCountInCache(queryClient: ReturnType<typeof useQueryClient>, conversationId: string, nextUnreadCount: number) {
  queryClient.setQueriesData<CachedConversationList>({ queryKey: ['conversations'] }, (current) => {
    if (!current) return current;
    return {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: (page.items ?? []).map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unreadCount: Math.max(conversation.unreadCount ?? 0, nextUnreadCount) }
            : conversation,
        ),
      })),
    };
  });
}

function incrementInboxUnreadCountInCache(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.setQueriesData<number | { count?: number; unreadCount?: number; total?: number }>({ queryKey: ['inbox-unread-count'] }, (current) => {
    if (typeof current === 'number') return current + 1;
    if (current && typeof current === 'object' && 'count' in current) return { ...current, count: (current.count ?? 0) + 1 };
    return current;
  });
}

function incrementNotificationUnreadCountInCache(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.setQueryData<number | { count?: number; unreadCount?: number }>(notificationQueryKeys.unreadCount(), (current) => {
    if (typeof current === 'number') return current + 1;
    if (current && typeof current === 'object' && 'count' in current) return { ...current, count: (current.count ?? 0) + 1 };
    return current == null ? 1 : current;
  });
}

function prependNotificationInCache(queryClient: ReturnType<typeof useQueryClient>, payload: NotificationCreatedEvent) {
  const item = notificationFromRealtimeEvent(payload);
  queryClient.setQueriesData<NotificationListResponse>({ queryKey: [...notificationQueryKeys.all, 'list'] }, (current) => {
    if (!current || !Array.isArray(current.items)) {
      return {
        items: [item],
        meta: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          unreadOnly: false,
          workspaceId: payload.workspaceId,
        },
      };
    }
    if (current.items.some((existing) => existing.id === item.id || existing.notificationId === item.notificationId)) {
      return current;
    }
    return {
      ...current,
      items: [item, ...current.items],
      meta: current.meta
        ? { ...current.meta, total: (current.meta.total ?? current.items.length) + 1 }
        : current.meta,
    };
  });
}

function shouldSurfaceNotification(
  payload: NotificationCreatedRealtimeEvent,
  preferences: NotificationPreferences,
) {
  if (!preferences.newConversationAlertsEnabled) return false;
  if (!preferences.mentionsAndAssignmentsOnly) return true;
  return payload.type === 'CONVERSATION_ASSIGNED' || payload.type === 'CONVERSATION_UNASSIGNED';
}

export function useRealtimeSync(accessToken: string | null) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const notificationPreferences = useNotificationPreferences();
  const preferencesRef = useRef<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);

  preferencesRef.current = notificationPreferences.isLoaded
    ? {
        soundEnabled: notificationPreferences.soundEnabled,
        backgroundSoundEnabled: notificationPreferences.backgroundSoundEnabled,
        browserNotificationsEnabled: notificationPreferences.browserNotificationsEnabled,
        newConversationAlertsEnabled: notificationPreferences.newConversationAlertsEnabled,
        incomingCallAlertsEnabled: notificationPreferences.incomingCallAlertsEnabled,
        mentionsAndAssignmentsOnly: notificationPreferences.mentionsAndAssignmentsOnly,
        dailySummaryDigestEnabled: notificationPreferences.dailySummaryDigestEnabled,
      }
    : DEFAULT_NOTIFICATION_PREFERENCES;

  useEffect(() => {
    if (!accessToken) {
      setConnected(false);
      setRealtimeConnectionStatus('disconnected');
      return;
    }

    const socket = createRealtimeSocket(() => latestAccessToken ?? accessToken);

    const handleConversationUpdated = (payload: ConversationUpdatedEvent) => {
      // Match web: metadata-only updates have no messageId; status updates have messageId + createdMessage=false.
      const shouldRefreshConversationMetadata = !payload.createdMessage && !payload.messageId;
      const isMessageStatusUpdate = !payload.createdMessage && Boolean(payload.messageId);
      const isRecentLocalMessageEcho = shouldSuppressRealtimeMessageRefresh(payload.conversationId, payload.messageId);

      // Instant tick update when the backend includes delivery status (Delivered/Read/Failed).
      // Also apply for local send echoes that carry QUEUED→SENT/FAILED progression.
      patchConversationMessageStatus(queryClient, payload);

      if (shouldRefreshConversationMetadata) {
        invalidateInboxQueries(queryClient, 1500);
        if (payload.conversationId) {
          schedule(`assignment-events:${payload.conversationId}`, () => {
            void queryClient.invalidateQueries({ queryKey: ['assignment-events', payload.conversationId], refetchType: 'active' });
          }, 800);
        }
      }

      // Skip only the paired creation echo when it does not carry a status — send onSuccess
      // already confirmed the bubble. Later DELIVERED/READ (createdMessage=false) must refresh.
      if (isRecentLocalMessageEcho && payload.createdMessage && !payload.messageDeliveryStatus) {
        return;
      }

      // Creation events without status are owned by message.created; refresh for status/meta.
      if (payload.conversationId && (!payload.createdMessage || payload.messageDeliveryStatus)) {
        refreshConversationMessages(
          queryClient,
          payload.conversationId,
          isMessageStatusUpdate || Boolean(payload.messageDeliveryStatus) ? 400 : 600,
        );
      }
    };

    const handleMessageCreated = (payload: MessageCreatedEvent) => {
      const isRecentLocalMessageEcho = shouldSuppressRealtimeMessageRefresh(payload.conversationId, payload.messageId);
      const isConversationCurrentlyViewed = getActiveConversationId() === payload.conversationId;

      if (!isConversationCurrentlyViewed && !isRecentLocalMessageEcho) {
        const currentUnreadCount = getCachedConversationUnreadCount(queryClient, payload.conversationId);
        incrementConversationUnreadCountInCache(queryClient, payload.conversationId, currentUnreadCount + 1);
        if (currentUnreadCount <= 0) incrementInboxUnreadCountInCache(queryClient);
      }

      // Local send already patched the thread cache — skip refetch to avoid optimistic blink.
      if (isRecentLocalMessageEcho) {
        invalidateInboxQueries(queryClient, 1200);
        return;
      }

      invalidateInboxQueries(queryClient, 1200);
      if (payload.conversationId) {
        refreshConversationMessages(queryClient, payload.conversationId, 600);
      }
    };

    const handleCallSessionUpdated = (payload: CallSessionUpdatedEvent) => {
      if (payload.conversationId) {
        schedule(`calls:${payload.conversationId}`, () => {
          void queryClient.invalidateQueries({ queryKey: ['conversation-calls', payload.conversationId], refetchType: 'active' });
        }, 600);
      }
      schedule('workspace-calls', () => {
        void queryClient.invalidateQueries({ queryKey: ['workspace-calls'], refetchType: 'active' });
        void queryClient.invalidateQueries({ queryKey: ['workspace-calls-summary'], refetchType: 'active' });
        void queryClient.invalidateQueries({ queryKey: ['active-calls'], refetchType: 'active' });
      }, 800);
      invalidateInboxQueries(queryClient, 1500);
    };

    const handleNotificationCreated = (payload: NotificationCreatedEvent) => {
      if (!payload?.notificationId) return;
      if (handledNotificationIds.has(payload.notificationId)) return;
      handledNotificationIds.add(payload.notificationId);

      const preferences = preferencesRef.current;

      // Keep badge + list warm even while the notification sheet is closed.
      incrementNotificationUnreadCountInCache(queryClient);
      prependNotificationInCache(queryClient, payload);
      void queryClient.invalidateQueries({ queryKey: [...notificationQueryKeys.all, 'list'], refetchType: 'active' });
      void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount(), refetchType: 'active' });

      if (payload.type === 'INCOMING_CALL') {
        if (preferences.incomingCallAlertsEnabled) {
          writeIncomingCallPrompt(payload as Parameters<typeof writeIncomingCallPrompt>[0]);
          void queryClient.invalidateQueries({ queryKey: ['active-calls'], refetchType: 'active' });
          if (preferences.soundEnabled) void playNotificationSound(payload.type);
        }
        return;
      }

      // Match web: sound follows soundEnabled for all notification types.
      if (preferences.soundEnabled) {
        void playNotificationSound(payload.type);
      }

      if (!shouldSurfaceNotification(payload, preferences)) return;
    };

    const onConnect = () => {
      console.log('[realtime] connected');
      setConnected(true);
      setRealtimeConnectionStatus('connected');
    };
    const onDisconnect = (reason: string) => {
      console.log('[realtime] disconnected', reason);
      setConnected(false);
      setRealtimeConnectionStatus('disconnected');
    };
    const onConnectError = (error: Error) => {
      console.warn('[realtime] connect_error', error.message);
      setRealtimeConnectionStatus('connecting');
    };
    const onReconnectAttempt = () => setRealtimeConnectionStatus('connecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on(REALTIME_READY_EVENT, onConnect);
    socket.on(REALTIME_CONVERSATION_UPDATED_EVENT, handleConversationUpdated);
    socket.on(REALTIME_MESSAGE_CREATED_EVENT, handleMessageCreated);
    socket.on(REALTIME_CALL_SESSION_UPDATED_EVENT, handleCallSessionUpdated);
    socket.on(REALTIME_NOTIFICATION_CREATED_EVENT, handleNotificationCreated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off(REALTIME_READY_EVENT, onConnect);
      socket.off(REALTIME_CONVERSATION_UPDATED_EVENT, handleConversationUpdated);
      socket.off(REALTIME_MESSAGE_CREATED_EVENT, handleMessageCreated);
      socket.off(REALTIME_CALL_SESSION_UPDATED_EVENT, handleCallSessionUpdated);
      socket.off(REALTIME_NOTIFICATION_CREATED_EVENT, handleNotificationCreated);
      socket.disconnect();
      pendingInvalidations.forEach((timeout) => clearTimeout(timeout));
      pendingInvalidations.clear();
      setConnected(false);
      setRealtimeConnectionStatus('disconnected');
    };
  }, [accessToken, queryClient]);

  return { connected };
}
