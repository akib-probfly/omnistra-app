import type { ConversationCallSession } from '../api/inbox';
import type { IncomingCallPrompt } from './incoming-call-prompt';

export const INCOMING_CALL_TTL_MS = 90_000;
export type CallScope = { userId: string; workspaceId: string };

export function isIncomingCallPromptExpired(prompt: Pick<IncomingCallPrompt, 'createdAt'>, now = Date.now()) {
  const age = now - Date.parse(prompt.createdAt);
  return !Number.isFinite(age) || age >= INCOMING_CALL_TTL_MS || age < -60_000;
}

export function isIncomingCallPromptInScope(prompt: IncomingCallPrompt | null, scope: CallScope | null): boolean {
  if (!scope || !prompt || prompt.type !== 'INCOMING_CALL' || prompt.callEvent === 'ENDED' ||
      prompt.workspaceId !== scope.workspaceId || !prompt.conversationId || !prompt.entityId || isIncomingCallPromptExpired(prompt)) return false;
  return prompt.storedForUserId === scope.userId ||
    (!prompt.storedForUserId && Array.isArray(prompt.recipientUserIds) && prompt.recipientUserIds.includes(scope.userId));
}

export function isCallSessionRoutedToUser(session: ConversationCallSession, userId: string) {
  if (session.claimedByUserId) return session.claimedByUserId === userId;
  if (session.direction !== 'INBOUND') return true;
  const targets = session.metadata && typeof session.metadata === 'object'
    ? (session.metadata as Record<string, unknown>).routingTargetUserIds : undefined;
  return !Array.isArray(targets) || targets.includes(userId);
}

export function isActionableIncomingCall(session: ConversationCallSession | null | undefined) {
  return Boolean(session && session.direction === 'INBOUND' && !session.endedAt &&
    !session.claimedByWorkspaceMemberId && !session.claimedByUserId &&
    ['REQUESTED', 'PERMISSION_REQUESTED', 'RINGING'].includes(session.status));
}
