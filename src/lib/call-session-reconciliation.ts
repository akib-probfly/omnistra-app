import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { fetchConversationCallSession, declineConversationCall, type ConversationCallSession, type ConversationCallSessionsResponse } from '../api/inbox';
import { notificationQueryKeys, type NotificationCreatedRealtimeEvent } from '../api/notifications';
import { isActionableIncomingCall, isIncomingCallPromptExpired } from './incoming-call-state';
import { clearIncomingCallPrompt } from './incoming-call-prompt';
import { dismissIncomingCallNotification } from './call-notification';
import { isCallSessionTerminal } from './inbox-utils';
import { upsertActiveCallSessionCache } from './active-call-cache';
import { callScopeFromAccessToken } from './jwt-workspace';

type CallIdentity = { conversationId: string; callSessionId: string };

export function isCallStateError(error: unknown): error is ApiError {
  return error instanceof ApiError && [403, 404, 409].includes(error.status);
}

export function callStateErrorMessage(error: unknown): string | null {
  if (!isCallStateError(error)) return null;
  if (error.status === 403) return 'You no longer have access to this call';
  if (error.status === 404) return 'This call is no longer available';
  return error.message;
}

export async function performVerifiedCallAction<T extends CallIdentity>(params: T, action: 'answer' | 'decline' | 'end', operation: (params: T) => Promise<ConversationCallSession>) {
  const current = await fetchConversationCallSession(params);
  if (action === 'end' && (current.endedAt || isCallSessionTerminal(current.status))) return current;
  if (action !== 'end' && !isActionableIncomingCall(current)) {
    throw new ApiError(current.claimedByWorkspaceMemberId ? 'This call was already answered' : 'This call has already ended', 409);
  }
  return operation(params);
}

export function refreshCallCaches(queryClient: QueryClient, params: CallIdentity) {
  return Promise.all([
    ['active-calls'], ['call-session-state'], ['conversation-calls', params.conversationId],
    ['conversation-call-events', params.conversationId], ['workspace-calls'], ['workspace-calls-summary'],
    ['conversations'], [...notificationQueryKeys.all],
  ].map((queryKey) => queryClient.invalidateQueries({ queryKey, refetchType: 'active' })));
}

export async function reconcileCallSuccess(queryClient: QueryClient, current: ConversationCallSession) {
  await clearIncomingCallPrompt(current.id);
  await dismissIncomingCallNotification(current.id);
  upsertActiveCallSessionCache(queryClient, { ...current, callSessionId: current.id });
  queryClient.setQueriesData<ConversationCallSessionsResponse>({ queryKey: ['conversation-calls', current.conversationId] },
    (previous) => previous ? { ...previous, items: previous.items.map((item) => item.id === current.id ? current : item) } : previous);
  void refreshCallCaches(queryClient, { conversationId: current.conversationId, callSessionId: current.id });
}

export async function reconcileCallActionError(queryClient: QueryClient | undefined, error: unknown, params: CallIdentity) {
  let current: ConversationCallSession | null = null;
  let unavailable = error instanceof ApiError && [403, 404].includes(error.status);
  if (error instanceof ApiError && error.status === 409) {
    try { current = await fetchConversationCallSession(params); unavailable = !isActionableIncomingCall(current); }
    catch (readError) { unavailable = readError instanceof ApiError && [403, 404].includes(readError.status); }
  }
  if (unavailable) {
    await clearIncomingCallPrompt(params.callSessionId);
    await dismissIncomingCallNotification(params.callSessionId);
    queryClient?.setQueriesData<ConversationCallSessionsResponse>({ queryKey: ['active-calls'] },
      (previous) => previous ? { ...previous, items: previous.items.filter((item) => item.id !== params.callSessionId) } : previous);
  }
  if (queryClient) {
    if (current) upsertActiveCallSessionCache(queryClient, { ...current, callSessionId: current.id });
    void refreshCallCaches(queryClient, params);
  }
}

// Shared by foreground notification responses and headless Android/iOS actions.
export async function declineCallFromNotification(prompt: NotificationCreatedRealtimeEvent, queryClient?: QueryClient) {
  const scope = callScopeFromAccessToken();
  if (prompt.type !== 'INCOMING_CALL' || prompt.callEvent === 'ENDED' || !prompt.conversationId ||
      isIncomingCallPromptExpired(prompt) || !scope?.canManageCalls || scope.workspaceId !== prompt.workspaceId) {
    if (prompt.type === 'INCOMING_CALL') {
      await clearIncomingCallPrompt(prompt.entityId);
      await dismissIncomingCallNotification(prompt.entityId);
    }
    return;
  }
  const params = { conversationId: prompt.conversationId, callSessionId: prompt.entityId };
  try {
    const current = await performVerifiedCallAction(params, 'decline', declineConversationCall);
    if (queryClient) await reconcileCallSuccess(queryClient, current);
    else { await clearIncomingCallPrompt(current.id); await dismissIncomingCallNotification(current.id); }
    return current;
  } catch (error) {
    await reconcileCallActionError(queryClient, error, params);
    throw error;
  }
}
