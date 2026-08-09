import { useEffect, useState } from 'react';
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

type ConversationUpdatedEvent = { workspaceId: string; conversationId: string; messageId: string | null; createdConversation: boolean; createdMessage: boolean; occurredAt: string };
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

  useEffect(() => {
    if (!accessToken) {
      setConnected(false);
      setRealtimeConnectionStatus('disconnected');
      return;
    }

    const socket = createRealtimeSocket(() => latestAccessToken ?? accessToken);
    const preferences: NotificationPreferences = notificationPreferences.isLoaded
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

    const handleConversationUpdated = (payload: ConversationUpdatedEvent) => {
      const isStatusOrMetaUpdate = !payload.createdMessage && !payload.messageId;
      const isRecentLocalMessageEcho = shouldSuppressRealtimeMessageRefresh(payload.conversationId, payload.messageId);
      if (isStatusOrMetaUpdate) {
        invalidateInboxQueries(queryClient, 1500);
        if (payload.conversationId) {
          schedule(`assignment-events:${payload.conversationId}`, () => {
            void queryClient.invalidateQueries({ queryKey: ['assignment-events', payload.conversationId], refetchType: 'all' });
          }, 800);
        }
      }
      // Skip thread refetch for our own send echo — cache already has the confirmed bubble.
      if (isRecentLocalMessageEcho) return;
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

      // Local send already patched the thread cache — skip refetch to avoid optimistic blink.
      if (isRecentLocalMessageEcho) {
        invalidateInboxQueries(queryClient, 1200);
        return;
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
      schedule('workspace-calls', () => {
        void queryClient.invalidateQueries({ queryKey: ['workspace-calls'], refetchType: 'all' });
        void queryClient.invalidateQueries({ queryKey: ['workspace-calls-summary'], refetchType: 'all' });
        void queryClient.invalidateQueries({ queryKey: ['active-calls'], refetchType: 'all' });
      }, 800);
      invalidateInboxQueries(queryClient, 1500);
    };

    const handleNotificationCreated = (payload: NotificationCreatedEvent) => {
      if (!payload?.notificationId) return;
      if (handledNotificationIds.has(payload.notificationId)) return;
      handledNotificationIds.add(payload.notificationId);

      // Keep badge + list warm even while the notification sheet is closed.
      incrementNotificationUnreadCountInCache(queryClient);
      prependNotificationInCache(queryClient, payload);
      void queryClient.invalidateQueries({ queryKey: [...notificationQueryKeys.all, 'list'], refetchType: 'all' });
      void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount(), refetchType: 'all' });

      if (payload.type === 'INCOMING_CALL') {
        if (preferences.incomingCallAlertsEnabled) {
          writeIncomingCallPrompt(payload as Parameters<typeof writeIncomingCallPrompt>[0]);
          void queryClient.invalidateQueries({ queryKey: ['active-calls'], refetchType: 'all' });
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
  }, [
    accessToken,
    notificationPreferences.backgroundSoundEnabled,
    notificationPreferences.browserNotificationsEnabled,
    notificationPreferences.dailySummaryDigestEnabled,
    notificationPreferences.incomingCallAlertsEnabled,
    notificationPreferences.isLoaded,
    notificationPreferences.mentionsAndAssignmentsOnly,
    notificationPreferences.newConversationAlertsEnabled,
    notificationPreferences.soundEnabled,
    queryClient,
  ]);

  return { connected };
}
