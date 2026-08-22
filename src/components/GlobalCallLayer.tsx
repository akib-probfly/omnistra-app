import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  fetchActiveConversationCallSessions,
  type ConversationCallConversation,
  type ConversationCallSession,
} from '../api/inbox';
import { useAuth } from '../auth/AuthContext';
import { fetchMyProfile } from '../api/profile';
import {
  clearIncomingCallPrompt,
  readIncomingCallPrompt,
  subscribeIncomingCallPrompt,
  type IncomingCallPrompt,
} from '../lib/incoming-call-prompt';
import { extractWhatsappCallSignal } from '../lib/whatsapp-calling';
import { isCallSessionTerminal, isLiveCallSession } from '../lib/inbox-utils';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { useCallController } from '../providers/CallControllerProvider';
import { getRealtimeConnectionStatus, subscribeRealtimeConnectionStatus } from '../api/realtime';
import { CallPanel } from './CallPanel';

function selectVisibleCallSession(sessions: ConversationCallSession[], currentUserId: string | undefined) {
  if (sessions.length === 0) return null;

  const visibleSessions = sessions.filter((session) => {
    if (!isLiveCallSession(session)) return false;
    if (!session.claimedByUserId) {
      return session.direction === 'OUTBOUND' && (session.status === 'RINGING' || session.status === 'CONNECTED');
    }
    const isLiveClaimedSession =
      (session.direction === 'INBOUND'
        && (session.status === 'REQUESTED'
          || session.status === 'PERMISSION_REQUESTED'
          || session.status === 'RINGING'
          || session.status === 'CONNECTED'))
      || (session.direction === 'OUTBOUND' && (session.status === 'RINGING' || session.status === 'CONNECTED'));
    return Boolean(currentUserId) && session.claimedByUserId === currentUserId && isLiveClaimedSession;
  });

  const inboundAttentionSession = visibleSessions.find(
    (session) =>
      session.direction === 'INBOUND'
      && (session.status === 'REQUESTED' || session.status === 'PERMISSION_REQUESTED' || session.status === 'RINGING'),
  );
  if (inboundAttentionSession) return inboundAttentionSession;

  return (
    visibleSessions.find((session) => session.status === 'RINGING')
    ?? visibleSessions.find((session) => session.status === 'CONNECTED')
    ?? visibleSessions[0]
    ?? null
  );
}

function selectIncomingCallSession(sessions: ConversationCallSession[]) {
  return sessions.find(
    (session) =>
      isLiveCallSession(session)
      && session.direction === 'INBOUND'
      && !session.claimedByUserId
      && (session.status === 'REQUESTED' || session.status === 'PERMISSION_REQUESTED' || session.status === 'RINGING'),
  ) ?? null;
}

function buildPromptedCallSession(prompt: IncomingCallPrompt): ConversationCallSession | null {
  if (prompt.type !== 'INCOMING_CALL') return null;
  const metadata = prompt.metadata && typeof prompt.metadata === 'object' && !Array.isArray(prompt.metadata)
    ? prompt.metadata as Record<string, unknown>
    : null;
  const contactDisplayName = typeof metadata?.contactDisplayName === 'string' ? metadata.contactDisplayName : null;
  const contactPhone = typeof metadata?.contactPhone === 'string' ? metadata.contactPhone : null;
  const channelName = typeof metadata?.channelName === 'string' ? metadata.channelName : 'WhatsApp';

  return {
    id: prompt.entityId,
    workspaceId: prompt.workspaceId,
    conversationId: prompt.conversationId ?? '',
    channelAccountId: prompt.channelId ?? '',
    initiatedByWorkspaceMemberId: null,
    claimedByWorkspaceMemberId: null,
    claimedByUserId: null,
    claimedAt: null,
    initiatedBy: null,
    claimedBy: null,
    direction: 'INBOUND',
    provider: 'WHATSAPP',
    providerCallId: null,
    providerSessionId: null,
    permissionRequestMessageId: null,
    recipientIdentityValue: contactPhone ?? '',
    recipientDisplayName: contactDisplayName,
    status: 'REQUESTED',
    permissionStatus: 'REQUESTED',
    requestedPermissionAt: prompt.createdAt,
    permissionRespondedAt: null,
    startedAt: prompt.createdAt,
    connectedAt: null,
    endedAt: null,
    durationSeconds: null,
    endedReason: null,
    metadata: prompt.metadata,
    conversation: prompt.conversationId
      ? {
          id: prompt.conversationId,
          workspaceId: prompt.workspaceId,
          status: 'OPEN',
          unreadCount: 0,
          contact: {
            id: prompt.conversationId,
            displayName: contactDisplayName,
            primaryPhone: contactPhone,
            avatarUrl: null,
          },
          channel: {
            channelId: prompt.channelId ?? '',
            channelType: 'WHATSAPP',
            channelName,
            displayPhoneNumber: null,
          },
          assignee: null,
        }
      : undefined,
    createdAt: prompt.createdAt,
    updatedAt: prompt.createdAt,
  };
}

function fallbackConversation(session: ConversationCallSession): ConversationCallConversation {
  return session.conversation ?? {
    id: session.conversationId,
    workspaceId: session.workspaceId,
    status: 'OPEN',
    unreadCount: 0,
    contact: {
      id: session.conversationId,
      displayName: session.recipientDisplayName?.trim() || null,
      primaryPhone: session.recipientIdentityValue?.trim() || null,
      avatarUrl: session.conversation?.contact.avatarUrl ?? null,
    },
    channel: {
      channelId: session.channelAccountId,
      channelType: 'WHATSAPP',
      channelName: 'WhatsApp',
      displayPhoneNumber: null,
    },
    assignee: null,
  };
}

function getBizOpaqueCallbackData(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).bizOpaqueCallbackData;
  return typeof value === 'string' ? value : null;
}

export function GlobalCallLayer() {
  const { session } = useAuth();
  const callController = useCallController();
  useSyncExternalStore(subscribeRealtimeConnectionStatus, getRealtimeConnectionStatus);
  const appState = useSyncExternalStore(
    (onStoreChange) => {
      const sub = AppState.addEventListener('change', onStoreChange);
      return () => sub.remove();
    },
    () => AppState.currentState,
  );
  const profileQuery = useQuery({
    queryKey: ['me-profile'],
    queryFn: fetchMyProfile,
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
  });
  const currentUserId = profileQuery.data?.id;

  const activeCallsQuery = useQuery({
    queryKey: ['active-calls'],
    queryFn: () => fetchActiveConversationCallSessions({ limit: 5 }),
    enabled: Boolean(session),
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: () => {
      if (appState !== 'active') return false;
      // Only poll while this device is in a call. Incoming rings are applied from
      // call.session.updated + INCOMING_CALL notifications, not /calls/active.
      if (callController.isBusy) return 5000;
      return false;
    },
  });

  const [incomingCallPrompt, setIncomingCallPrompt] = useState<IncomingCallPrompt | null>(() => readIncomingCallPrompt());
  const dismissedPromptSessionIdsRef = useRef(new Set<string>());
  const { incomingCallAlertsEnabled, isLoaded: areNotificationPrefsLoaded } = useNotificationPreferences();
  const canShowIncomingCallAlerts = areNotificationPrefsLoaded && incomingCallAlertsEnabled;

  useEffect(() => subscribeIncomingCallPrompt((prompt) => {
    if (!prompt) {
      setIncomingCallPrompt(null);
      return;
    }
    if (!canShowIncomingCallAlerts) return;
    if (dismissedPromptSessionIdsRef.current.has(prompt.entityId)) return;
    setIncomingCallPrompt(prompt);
  }), [canShowIncomingCallAlerts]);

  const visibleCallSession = useMemo(
    () => selectVisibleCallSession(activeCallsQuery.data?.items ?? [], currentUserId),
    [activeCallsQuery.data?.items, currentUserId],
  );
  const incomingCallSession = useMemo(
    () => (canShowIncomingCallAlerts ? selectIncomingCallSession(activeCallsQuery.data?.items ?? []) : null),
    [activeCallsQuery.data?.items, canShowIncomingCallAlerts],
  );
  const promptCallSession = useMemo(
    () => (canShowIncomingCallAlerts && incomingCallPrompt ? buildPromptedCallSession(incomingCallPrompt) : null),
    [canShowIncomingCallAlerts, incomingCallPrompt],
  );

  const activeCallSession = visibleCallSession ?? incomingCallSession ?? promptCallSession;
  const activeCallSignal = useMemo(
    () => (activeCallSession ? extractWhatsappCallSignal(activeCallSession.metadata) : null),
    [activeCallSession],
  );

  useEffect(() => {
    const promptSessionId = incomingCallPrompt?.entityId;
    if (!promptSessionId) return;
    const matchingSession = activeCallsQuery.data?.items.find((item) => item.id === promptSessionId);
    if (!matchingSession) return;
    const shouldClear =
      isCallSessionTerminal(matchingSession.status)
      || Boolean(matchingSession.claimedByUserId && matchingSession.claimedByUserId !== currentUserId);
    if (!shouldClear) return;
    dismissedPromptSessionIdsRef.current.add(promptSessionId);
    clearIncomingCallPrompt(promptSessionId);
    setIncomingCallPrompt(null);
  }, [activeCallsQuery.data?.items, currentUserId, incomingCallPrompt?.entityId]);

  useEffect(() => {
    if (activeCallSignal?.sdpType === 'answer') {
      void callController.applyRemoteSignal(activeCallSignal);
    }
  }, [activeCallSignal, callController]);

  useEffect(() => {
    if (
      !activeCallSession
      && (callController.connectionState === 'disconnected' || callController.connectionState === 'failed')
    ) {
      callController.resetPeerContext();
    }
  }, [activeCallSession, callController]);

  if (!session) return null;

  if (
    !activeCallSession
    && callController.connectionState === 'idle'
    && !callController.errorMessage
    && !callController.remoteStream
  ) {
    return null;
  }

  if (!activeCallSession && callController.connectionState === 'idle') return null;

  const conversation = activeCallSession ? fallbackConversation(activeCallSession) : null;
  if (!conversation || !activeCallSession) return null;

  return (
    <CallPanel
      conversation={conversation}
      activeCallSession={activeCallSession}
      activeCallSignal={activeCallSignal}
      isBusy={callController.isBusy}
      connectionState={callController.connectionState}
      errorMessage={callController.errorMessage}
      remoteStream={callController.remoteStream}
      isMuted={callController.isMuted}
      onAnswerCall={() => {
        if (!activeCallSignal) return;
        void callController.answerCall({
          conversationId: activeCallSession.conversationId,
          callSessionId: activeCallSession.id,
          remoteOffer: activeCallSignal,
          bizOpaqueCallbackData: getBizOpaqueCallbackData(activeCallSession.metadata),
        });
      }}
      onDeclineCall={() => {
        void callController.declineCall({
          conversationId: activeCallSession.conversationId,
          callSessionId: activeCallSession.id,
        });
        dismissedPromptSessionIdsRef.current.add(activeCallSession.id);
        clearIncomingCallPrompt(activeCallSession.id);
      }}
      onEndCall={() => {
        void callController.endCall({
          conversationId: activeCallSession.conversationId,
          callSessionId: activeCallSession.id,
        });
      }}
      onToggleMute={() => callController.toggleMute()}
    />
  );
}
