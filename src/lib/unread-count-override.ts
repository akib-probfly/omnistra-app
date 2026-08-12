import type { ConversationListItem, ConversationListLastMessage } from '../api/inbox';

type PreviewOverride = {
  at: string;
  lastMessagePreview: string;
  lastInteraction: NonNullable<ConversationListItem['lastInteraction']>;
};

const unreadOverrides = new Map<string, number>();
const previewOverrides = new Map<string, PreviewOverride>();

export function setUnreadOverride(conversationId: string, unreadCount: number) {
  unreadOverrides.set(conversationId, unreadCount);
}

export function getUnreadOverride(conversationId: string): number | undefined {
  return unreadOverrides.get(conversationId);
}

export function clearUnreadOverride(conversationId: string) {
  unreadOverrides.delete(conversationId);
}

export function setPreviewOverride(
  conversationId: string,
  input: {
    at: string;
    preview: string;
    message: ConversationListLastMessage;
  },
) {
  previewOverrides.set(conversationId, {
    at: input.at,
    lastMessagePreview: input.preview,
    lastInteraction: {
      kind: 'MESSAGE',
      at: input.at,
      message: input.message,
    },
  });
}

export function clearPreviewOverride(conversationId: string) {
  previewOverrides.delete(conversationId);
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Apply optimistic inbox overrides without permanently hiding future unread/previews.
 * - Keep unread override while the server is still catching up.
 * - Keep preview override while the server last-interaction is older than our optimistic one.
 */
export function applyUnreadOverrideToPage(items: ConversationListItem[]) {
  return items.map((item) => {
    let next = item;

    const unreadOverride = unreadOverrides.get(item.id);
    if (unreadOverride !== undefined) {
      const serverUnread = item.unreadCount ?? 0;
      if (unreadOverride === 0) {
        // Mark-read: keep 0 until the server also reports 0 (backend can lag).
        if (serverUnread === 0) {
          unreadOverrides.delete(item.id);
        } else {
          next = { ...next, unreadCount: 0 };
        }
      } else if (unreadOverride > serverUnread) {
        // Optimistic bump: keep override until server catches up.
        if (serverUnread >= unreadOverride) {
          unreadOverrides.delete(item.id);
        } else {
          next = { ...next, unreadCount: unreadOverride };
        }
      } else {
        // Server is ahead (extra unread arrived) or mark-unread caught up.
        unreadOverrides.delete(item.id);
      }
    }

    const previewOverride = previewOverrides.get(item.id);
    if (previewOverride) {
      const serverAt = Math.max(
        toTimestamp(item.lastInteraction?.at),
        toTimestamp(item.lastMessageAt),
      );
      const optimisticAt = toTimestamp(previewOverride.at);
      if (serverAt >= optimisticAt) {
        previewOverrides.delete(item.id);
      } else {
        next = {
          ...next,
          lastMessagePreview: previewOverride.lastMessagePreview,
          lastMessageAt: previewOverride.at,
          lastInteraction: previewOverride.lastInteraction,
          updatedAt: previewOverride.at,
        };
      }
    }

    return next;
  });
}
