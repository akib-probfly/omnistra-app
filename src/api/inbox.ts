import { apiFetch } from './client';

export type QuickReplySnippet = {
  id: string;
  workspaceId?: string | null;
  title?: string | null;
  shortcut?: string | null;
  body: string;
  category?: string | null;
  channelScope?: string | null;
  isActive?: boolean;
  usageCount?: number;
  attachments?: Array<{ id: string; mediaType: string; originalName?: string | null }>;
};

export type WhatsappTemplateButton = { id?: string; type?: string; label?: string; url?: string | null; phoneNumber?: string | null; offerCode?: string | null };
export type WhatsappTemplate = {
  id: string;
  name: string;
  category?: string | null;
  status?: string | null;
  language?: string | null;
  header?: { enabled?: boolean; type?: string; content?: string } | null;
  body?: string | null;
  footer?: string | null;
  buttons?: WhatsappTemplateButton[] | null;
  variables?: Array<{ index?: number; label?: string; sampleValue?: string | null; section?: string }>;
  rejectionReason?: string | null;
};

export type ReactionAction = 'REACT' | 'UNREACT';

export type ConversationListItem = {
  id: string;
  workspaceId: string;
  status: 'OPEN' | 'ASSIGNED' | 'CLOSED';
  isStarred?: boolean;
  unreadCount: number;
  isUnreplied: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  contact: { id: string; displayName: string | null; avatarUrl: string | null; primaryPhone?: string | null };
  channel: { channelId: string; channelType: string; channelName: string; displayPhoneNumber: string | null };
  assignee?: { workspaceMemberId: string; userName: string | null; userEmail: string; avatarUrl: string | null } | null;
};

export type ConversationsListResponse = { items: ConversationListItem[]; pageInfo?: { nextCursor?: string | null; hasMore?: boolean } };

export type ConversationsFilters = {
  workspaceId?: string;
  status?: 'OPEN' | 'ASSIGNED' | 'CLOSED';
  search?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  unrepliedOnly?: boolean;
  assignment?: 'any' | 'assigned' | 'unassigned';
  channelTypes?: string[];
  assigneeWorkspaceMemberIds?: string[];
  includeEmpty?: boolean;
  cursor?: string;
  limit?: number;
};

function buildQueryString(params: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value === true) {
      query.set(key, 'true');
    } else {
      query.set(key, String(value));
    }
  });
  const raw = query.toString();
  return raw ? `?${raw}` : '';
}

export async function fetchConversations(params: ConversationsFilters = {}): Promise<ConversationsListResponse> {
  return apiFetch<ConversationsListResponse>(`/conversations${buildQueryString({
    workspaceId: params.workspaceId,
    status: params.status,
    search: params.search,
    unreadOnly: params.unreadOnly,
    starredOnly: params.starredOnly,
    unrepliedOnly: params.unrepliedOnly,
    assignment: params.assignment,
    channelTypes: params.channelTypes,
    assigneeWorkspaceMemberIds: params.assigneeWorkspaceMemberIds,
    includeEmpty: params.includeEmpty,
    cursor: params.cursor,
    limit: params.limit ?? 25,
  })}`);
}

export async function fetchConversationCount(params: Omit<ConversationsFilters, 'cursor' | 'limit'> = {}): Promise<number> {
  const response = await apiFetch<{ count?: number; total?: number } | number>(`/conversations/count${buildQueryString({
    workspaceId: params.workspaceId,
    status: params.status,
    search: params.search,
    unreadOnly: params.unreadOnly,
    starredOnly: params.starredOnly,
    unrepliedOnly: params.unrepliedOnly,
    assignment: params.assignment,
    channelTypes: params.channelTypes,
    assigneeWorkspaceMemberIds: params.assigneeWorkspaceMemberIds,
    includeEmpty: params.includeEmpty,
  })}`);
  if (typeof response === 'number') return response;
  return response?.count ?? response?.total ?? 0;
}

export async function fetchConversationUnreadCount(params: Omit<ConversationsFilters, 'cursor' | 'limit' | 'status'> = {}): Promise<number> {
  const response = await apiFetch<{ count?: number; unreadCount?: number; total?: number } | number>(`/conversations/unread-count${buildQueryString({
    workspaceId: params.workspaceId,
    search: params.search,
    unreadOnly: params.unreadOnly,
    starredOnly: params.starredOnly,
    unrepliedOnly: params.unrepliedOnly,
    assignment: params.assignment,
    channelTypes: params.channelTypes,
    assigneeWorkspaceMemberIds: params.assigneeWorkspaceMemberIds,
  })}`);
  if (typeof response === 'number') return response;
  return response?.count ?? response?.unreadCount ?? response?.total ?? 0;
}

export async function updateConversationAssignment(conversationId: string, assigneeWorkspaceMemberId: string | null) {
  return apiFetch(`/conversations/${conversationId}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify({ assigneeWorkspaceMemberId }),
  });
}

export type AssigneeFilterOption = {
  workspaceMemberId: string;
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  roleKey: 'workspace_admin' | 'workspace_manager' | 'workspace_agent';
};

export async function fetchAssigneeOptions(workspaceId?: string, channelId?: string): Promise<AssigneeFilterOption[]> {
  const response = await apiFetch<{ workspaceId: string; items: AssigneeFilterOption[] }>(`/conversations/assignee-filter-options${buildQueryString({ workspaceId, channelId })}`);
  return response.items ?? [];
}

export async function updateConversationStar(conversationId: string, isStarred: boolean) {
  return apiFetch(`/conversations/${conversationId}/star`, { method: 'PATCH', body: JSON.stringify({ isStarred }) });
}

export async function markConversationRead(conversationId: string) {
  return apiFetch(`/conversations/${conversationId}/read`, { method: 'PATCH' });
}

export async function markConversationUnread(conversationId: string) {
  return apiFetch(`/conversations/${conversationId}/unread`, { method: 'PATCH' });
}

export async function updateConversationStatus(conversationId: string, status: 'OPEN' | 'CLOSED') {
  return apiFetch(`/conversations/${conversationId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function fetchQuickReplies(params: { workspaceId?: string; search?: string; limit?: number; cursor?: string }) {
  const query = new URLSearchParams();
  if (params.workspaceId) query.set('workspaceId', params.workspaceId);
  if (params.search) query.set('search', params.search);
  query.set('limit', String(params.limit ?? 20));
  if (params.cursor) query.set('cursor', params.cursor);
  return apiFetch<{ items: QuickReplySnippet[]; pageInfo?: { nextCursor?: string | null; hasMore?: boolean } }>(`/quick-replies?${query.toString()}`);
}

export async function fetchWhatsappTemplates(channelId: string) {
  return apiFetch<{ items: WhatsappTemplate[] }>(`/channels/${channelId}/whatsapp/templates`);
}

export async function sendReaction(conversationId: string, messageId: string, emoji: string, reactionAction: ReactionAction) {
  return apiFetch(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ type: 'REACTION', emoji, reactionAction, replyToMessageId: messageId }),
  });
}

export async function fetchMessagesPage(conversationId: string, cursor?: string, limit = 50) {
  const query = new URLSearchParams();
  query.set('limit', String(limit));
  if (cursor) query.set('cursor', cursor);
  return apiFetch<{ items: Array<Record<string, unknown>>; pageInfo?: { nextCursor?: string | null; hasMore?: boolean } }>(`/conversations/${conversationId}/messages?${query.toString()}`);
}

export type ConversationCallSessionStatus = 'REQUESTED' | 'PERMISSION_REQUESTED' | 'RINGING' | 'CONNECTED' | 'ENDED' | 'MISSED' | 'REJECTED' | 'FAILED' | 'CANCELLED';
export type ConversationCallPermissionStatus = 'NONE' | 'REQUESTED' | 'GRANTED' | 'DENIED' | 'EXPIRED';
export type ConversationCallMember = { userName: string | null; userEmail: string | null };

export type ConversationCallSession = {
  id: string;
  workspaceId: string;
  conversationId: string;
  channelAccountId: string;
  initiatedByWorkspaceMemberId: string | null;
  claimedByWorkspaceMemberId: string | null;
  claimedByUserId: string | null;
  claimedAt: string | null;
  initiatedBy: ConversationCallMember | null;
  claimedBy: ConversationCallMember | null;
  direction: 'INBOUND' | 'OUTBOUND';
  provider: string;
  providerCallId: string | null;
  providerSessionId: string | null;
  permissionRequestMessageId: string | null;
  recipientIdentityValue: string;
  recipientDisplayName: string | null;
  status: ConversationCallSessionStatus;
  permissionStatus: ConversationCallPermissionStatus;
  requestedPermissionAt: string | null;
  permissionRespondedAt: string | null;
  startedAt: string | null;
  connectedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  endedReason: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ConversationCallSessionsResponse = {
  items: ConversationCallSession[];
  pageInfo?: { nextCursor?: string | null; hasMore?: boolean };
};

export async function fetchConversationCallSessions(params: {
  conversationId: string;
  cursor?: string;
  limit?: number;
  status?: ConversationCallSessionStatus;
  direction?: 'INBOUND' | 'OUTBOUND';
}): Promise<ConversationCallSessionsResponse> {
  return apiFetch<ConversationCallSessionsResponse>(`/conversations/${params.conversationId}/calls${buildQueryString({
    cursor: params.cursor,
    limit: params.limit ?? 10,
    status: params.status,
    direction: params.direction,
  })}`);
}

export async function sendTemplateMessage(params: {
  conversationId: string;
  templateName: string;
  templateCategory?: string | null;
  languageCode?: string | null;
  templateComponents?: unknown[];
  text?: string | null;
  replyToMessageId?: string | null;
}) {
  return apiFetch(`/conversations/${params.conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'TEMPLATE',
      templateName: params.templateName,
      ...(params.templateCategory ? { templateCategory: params.templateCategory } : {}),
      ...(params.languageCode ? { languageCode: params.languageCode } : {}),
      ...(params.templateComponents ? { templateComponents: params.templateComponents } : {}),
      ...(params.text ? { text: params.text } : {}),
      ...(params.replyToMessageId ? { replyToMessageId: params.replyToMessageId } : {}),
    }),
  });
}
