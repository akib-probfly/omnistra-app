import type { QueryClient } from '@tanstack/react-query';
import { setUnreadOverride } from './unread-count-override';

export function setConversationUnreadInCache(
  queryClient: QueryClient,
  conversationId: string,
  unreadCount: number,
) {
  queryClient.setQueriesData<any>({ queryKey: ['conversations'] }, (current: any) => {
    if (!current) return current;
    if (Array.isArray(current?.pages)) {
      return {
        ...current,
        pages: current.pages.map((page: any) => ({
          ...page,
          items: (page.items ?? []).map((item: any) =>
            item.id === conversationId ? { ...item, unreadCount } : item,
          ),
        })),
      };
    }
    if (Array.isArray(current?.items)) {
      return {
        ...current,
        items: current.items.map((item: any) =>
          item.id === conversationId ? { ...item, unreadCount } : item,
        ),
      };
    }
    return current;
  });

  queryClient.setQueriesData<any>({ queryKey: ['messages', conversationId] }, (current: any) => {
    if (!current) return current;
    if (current.conversation) {
      return { ...current, conversation: { ...current.conversation, unreadCount } };
    }
    if (Array.isArray(current?.pages)) {
      return {
        ...current,
        pages: current.pages.map((page: any, index: number) =>
          index === 0 && page?.conversation
            ? { ...page, conversation: { ...page.conversation, unreadCount } }
            : page,
        ),
      };
    }
    return current;
  });
}

export function adjustInboxUnreadCount(queryClient: QueryClient, delta: number) {
  if (!delta) return;
  queryClient.setQueriesData<number | { count?: number; unreadCount?: number; total?: number }>(
    { queryKey: ['inbox-unread-count'] },
    (current: any) => {
      const base = typeof current === 'number'
        ? current
        : (current?.count ?? current?.unreadCount ?? current?.total ?? 0);
      return Math.max(0, base + delta);
    },
  );
}

/** Inbox unread badge counts conversations with unread > 0, not message totals. */
export function adjustInboxUnreadConversationCount(
  queryClient: QueryClient,
  previousUnread: number,
  nextUnread: number,
) {
  const wasUnread = previousUnread > 0;
  const isUnread = nextUnread > 0;
  if (wasUnread === isUnread) return;
  adjustInboxUnreadCount(queryClient, isUnread ? 1 : -1);
}

export function optimisticMarkConversationReadInCache(
  queryClient: QueryClient,
  conversationId: string,
  previousUnreadCount: number,
) {
  if (previousUnreadCount <= 0) return;
  setUnreadOverride(conversationId, 0);
  setConversationUnreadInCache(queryClient, conversationId, 0);
  adjustInboxUnreadConversationCount(queryClient, previousUnreadCount, 0);
}
