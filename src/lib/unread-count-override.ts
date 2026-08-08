import type { ConversationListItem } from '../api/inbox';

const overrides = new Map<string, number>();

export function setUnreadOverride(conversationId: string, unreadCount: number) {
  overrides.set(conversationId, unreadCount);
}

export function getUnreadOverride(conversationId: string): number | undefined {
  return overrides.get(conversationId);
}

export function clearUnreadOverride(conversationId: string) {
  overrides.delete(conversationId);
}

export function applyUnreadOverrideToPage(items: ConversationListItem[]) {
  return items.map((item) => {
    const override = overrides.get(item.id);
    if (override !== undefined && override !== item.unreadCount) {
      return { ...item, unreadCount: override };
    }
    return item;
  });
}
