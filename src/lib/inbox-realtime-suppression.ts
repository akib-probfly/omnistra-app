const LOCAL_SEND_SUPPRESSION_MS = 20000;
const recentLocalMessageIds = new Map<string, number>();
const recentLocalMessageIdsByConversation = new Map<string, Map<string, number>>();

function pruneExpired(now: number) {
  recentLocalMessageIds.forEach((expiresAt, messageId) => {
    if (expiresAt <= now) recentLocalMessageIds.delete(messageId);
  });
  recentLocalMessageIdsByConversation.forEach((messageIds, conversationId) => {
    messageIds.forEach((expiresAt, messageId) => {
      if (expiresAt <= now) messageIds.delete(messageId);
    });
    if (messageIds.size === 0) recentLocalMessageIdsByConversation.delete(conversationId);
  });
}

export function markRecentLocalMessageSend(conversationId: string, messageId: string | null) {
  if (!messageId) return;
  const now = Date.now();
  pruneExpired(now);
  recentLocalMessageIds.set(messageId, now + LOCAL_SEND_SUPPRESSION_MS);
  const conversationMessageIds = recentLocalMessageIdsByConversation.get(conversationId) ?? new Map<string, number>();
  conversationMessageIds.set(messageId, now + LOCAL_SEND_SUPPRESSION_MS);
  recentLocalMessageIdsByConversation.set(conversationId, conversationMessageIds);
}

export function shouldSuppressRealtimeMessageRefresh(conversationId: string, messageId?: string | null) {
  const now = Date.now();
  pruneExpired(now);

  if (messageId) {
    const messageExpiresAt = recentLocalMessageIds.get(messageId);
    if (messageExpiresAt && messageExpiresAt > now) return true;
    if ((recentLocalMessageIdsByConversation.get(conversationId)?.size ?? 0) > 0) return false;
  }

  return false;
}
