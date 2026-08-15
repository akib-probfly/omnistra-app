import type { QueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

type Attachment = {
  id: string;
  messageId?: string | null;
  mediaType: string;
  mimeType: string;
  originalName: string | null;
  downloadUrl: string;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  durationMs: number | null;
};

type Message = {
  id: string;
  type: string;
  text: string | null;
  attachments?: Attachment[];
  metadata?: { clientKey?: string; serverId?: string } | null;
  [key: string]: unknown;
};

type MessagesQueryData = {
  items: Message[];
  nextCursor: string | null;
  hasMore: boolean;
  conversation: unknown;
};

function normalizeMessageAttachments(messages: Message[]) {
  return messages.map((message) => {
    const messageAttachments = message.attachments ?? [];
    const mediaOnly =
      messageAttachments.length > 0
      && ['IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'DOCUMENT', 'FILE', 'STICKER'].includes(message.type);
    return {
      ...message,
      text: mediaOnly ? null : message.text,
      attachments: messageAttachments,
    };
  });
}

function preserveOptimisticMessages(serverItems: Message[], currentItems: Message[] | undefined) {
  if (!currentItems?.length) return serverItems;

  const serverIds = new Set(serverItems.map((item) => item.id));
  const merged = [...serverItems];

  currentItems.forEach((message) => {
    const serverId = typeof message.metadata?.serverId === 'string' ? message.metadata.serverId : null;
    const clientKey = typeof message.metadata?.clientKey === 'string' ? message.metadata.clientKey : null;
    const isOptimistic =
      message.id.startsWith('temp-')
      || message.id.startsWith('optimistic-')
      || Boolean(clientKey && !serverIds.has(message.id));

    if (!isOptimistic) return;
    if (serverId && serverIds.has(serverId)) return;
    if (serverIds.has(message.id)) return;
    if (clientKey && merged.some((item) => item.metadata?.clientKey === clientKey)) return;
    merged.push(message);
  });

  return merged;
}

/**
 * Fetch the latest messages page and write it into the cache.
 * Unlike refetchQueries({ type: 'active' }), this updates even when the
 * ConversationScreen observer is disabled (unfocused / unmounted).
 */
export async function refreshConversationMessagesPage(
  queryClient: QueryClient,
  conversationId: string,
) {
  const queryKey = ['messages', conversationId] as const;
  const current = queryClient.getQueryData<MessagesQueryData>(queryKey);

  try {
    // Message responses already include attachment metadata, so refreshing the
    // active page must not also fetch a broad attachment list.
    const page = await apiFetch<{
      items: Message[];
      pageInfo?: { nextCursor?: string | null; hasMore?: boolean };
      conversation?: unknown;
    }>(`/conversations/${conversationId}/messages?limit=50`);

    const items = preserveOptimisticMessages(
      normalizeMessageAttachments(page.items ?? []),
      current?.items,
    );

    queryClient.setQueryData<MessagesQueryData>(queryKey, {
      items,
      nextCursor: page.pageInfo?.nextCursor ?? null,
      hasMore: page.pageInfo?.hasMore ?? false,
      conversation: page.conversation ?? current?.conversation ?? null,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[realtime] message page refresh failed', conversationId, error);
    }
    void queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
  }
}
