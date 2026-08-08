import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createRealtimeSocket, setRealtimeConnectionStatus, getActiveConversationId } from '../api/realtime';
import { latestAccessToken } from '../api/client';
import { shouldSuppressRealtimeMessageRefresh } from '../lib/inbox-realtime-suppression';
import { playMessageNotificationSound } from '../lib/notificationSound';

const REALTIME_READY_EVENT = 'realtime.ready';
const REALTIME_CONVERSATION_UPDATED_EVENT = 'conversation.updated';
const REALTIME_MESSAGE_CREATED_EVENT = 'message.created';
const REALTIME_CALL_SESSION_UPDATED_EVENT = 'call.session.updated';
const REALTIME_NOTIFICATION_CREATED_EVENT = 'notification.created';

type ConversationUpdatedEvent = { workspaceId: string; conversationId: string; messageId: string | null; createdConversation: boolean; createdMessage: boolean; occurredAt: string };
type MessageCreatedEvent = { workspaceId: string; conversationId: string; messageId: string; createdAt: string };
type CallSessionUpdatedEvent = { workspaceId: string; conversationId: string; callSessionId: string; status: string };
type NotificationCreatedEvent = {
  notificationId: string;
  workspaceId: string;
  type: string;
  entityType: string;
  entityId: string;
  conversationId: string | null;
  channelId: string | null;
  targetScope: string;
  title: string;
  body: string;
  createdAt: string;
  metadata: unknown;
  recipientUserIds: string[] | null;
};

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

function invalidateInboxQueries(queryClient: ReturnType<typeof useQueryClient>, delay: number) {
  schedule(`inbox:${Date.now()}`, () => {
    void queryClient.invalidateQueries({ queryKey: ['conversations'], refetchType: 'all' });
    void queryClient.invalidateQueries({ queryKey: ['conversation-count'], refetchType: 'all' });
    void queryClient.invalidateQueries({ queryKey: ['inbox-unread-count'], refetchType: 'all' });
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
  queryClient.setQueryData<number | { count?: number; unreadCount?: number }>(['notifications', 'unread-count'], (current) => {
    if (typeof current === 'number') return current + 1;
    if (current && typeof current === 'object' && 'count' in current) return { ...current, count: (current.count ?? 0) + 1 };
    return current == null ? 1 : current;
  });
}

export function useRealtimeSync(accessToken: string | null) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setConnected(false);
      setRealtimeConnectionStatus('disconnected');
      return;
    }

    const socket = createRealtimeSocket(() => latestAccessToken ?? accessToken);

    const handleConversationUpdated = (payload: ConversationUpdatedEvent) => {
      const isStatusOrMetaUpdate = !payload.createdMessage && !payload.messageId;
      if (isStatusOrMetaUpdate) {
        invalidateInboxQueries(queryClient, 1500);
      }
      if (payload.conversationId) {
        schedule(`messages:${payload.conversationId}`, () => {
          void queryClient.invalidateQueries({ queryKey: ['messages', payload.conversationId], refetchType: 'active' });
        }, isStatusOrMetaUpdate ? 1000 : 600);
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

      invalidateInboxQueries(queryClient, 1200);
      if (payload.conversationId) {
        schedule(`messages:${payload.conversationId}`, () => {
          void queryClient.invalidateQueries({ queryKey: ['messages', payload.conversationId], refetchType: 'active' });
        }, 600);
      }
    };

    const handleCallSessionUpdated = (payload: CallSessionUpdatedEvent) => {
      if (payload.conversationId) {
        schedule(`calls:${payload.conversationId}`, () => {
          void queryClient.invalidateQueries({ queryKey: ['conversation-calls', payload.conversationId], refetchType: 'all' });
        }, 600);
      }
      invalidateInboxQueries(queryClient, 1500);
    };

    const handleNotificationCreated = (payload: NotificationCreatedEvent) => {
      if (handledNotificationIds.has(payload.notificationId)) return;
      handledNotificationIds.add(payload.notificationId);
      incrementNotificationUnreadCountInCache(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'list'], refetchType: 'active' });
      if (payload.type === 'NEW_MESSAGE') {
        void playMessageNotificationSound();
      }
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
