import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createRealtimeSocket, REALTIME_NAMESPACE, type Socket } from '../api/realtime';

const REALTIME_READY_EVENT = 'realtime.ready';
const REALTIME_CONVERSATION_UPDATED_EVENT = 'conversation.updated';
const REALTIME_MESSAGE_CREATED_EVENT = 'message.created';

type ConversationUpdatedEvent = { workspaceId: string; conversationId: string; messageId: string | null; createdConversation: boolean; createdMessage: boolean; occurredAt: string };
type MessageCreatedEvent = { workspaceId: string; conversationId: string; messageId: string; createdAt: string };

export function useRealtimeSync(accessToken: string | null) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const pendingRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!accessToken) {
      setConnected(false);
      return;
    }
    const socket = createRealtimeSocket(accessToken);
    const schedule = (key: string, invalidate: () => void, delay = 600) => {
      const existing = pendingRef.current.get(key);
      if (existing) clearTimeout(existing);
      pendingRef.current.set(key, setTimeout(() => {
        pendingRef.current.delete(key);
        invalidate();
      }, delay));
    };

    const handleConversationUpdated = (payload: ConversationUpdatedEvent) => {
      const isStatusOrMetaUpdate = !payload.createdMessage && !payload.messageId;
      if (isStatusOrMetaUpdate) {
        schedule('conversations', () => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['inbox-unread-count'] });
          queryClient.invalidateQueries({ queryKey: ['conversation-count'] });
        }, 1500);
      }
      if (payload.conversationId) {
        schedule(`messages:${payload.conversationId}`, () => {
          queryClient.invalidateQueries({ queryKey: ['messages', payload.conversationId] });
        }, isStatusOrMetaUpdate ? 1000 : 600);
      }
    };

    const handleMessageCreated = (payload: MessageCreatedEvent) => {
      schedule('conversations', () => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['inbox-unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['conversation-count'] });
      }, 1500);
      if (payload.conversationId) {
        schedule(`messages:${payload.conversationId}`, () => {
          queryClient.invalidateQueries({ queryKey: ['messages', payload.conversationId] });
        }, 600);
      }
    };

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onReady = () => setConnected(true);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(REALTIME_READY_EVENT, onReady);
    socket.on(REALTIME_CONVERSATION_UPDATED_EVENT, handleConversationUpdated);
    socket.on(REALTIME_MESSAGE_CREATED_EVENT, handleMessageCreated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(REALTIME_READY_EVENT, onReady);
      socket.off(REALTIME_CONVERSATION_UPDATED_EVENT, handleConversationUpdated);
      socket.off(REALTIME_MESSAGE_CREATED_EVENT, handleMessageCreated);
      socket.disconnect();
      pendingRef.current.forEach((timeout) => clearTimeout(timeout));
      pendingRef.current.clear();
      setConnected(false);
    };
  }, [accessToken, queryClient]);

  return { connected };
}
