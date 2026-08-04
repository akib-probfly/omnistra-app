import { apiFetch } from './client';

export type ConversationTag = {
  id: string;
  workspaceId?: string;
  text: string;
  normalizedText?: string;
  color?: string;
  isArchived?: boolean;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ConversationNote = {
  id: string;
  conversationId?: string;
  workspaceId?: string;
  authorMemberId?: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
  author?: { workspaceMemberId?: string; userName?: string | null; userEmail?: string } | null;
};

export type ConversationAttachment = {
  id: string;
  workspaceId?: string;
  messageId?: string | null;
  mediaType: string;
  mimeType?: string;
  originalName?: string | null;
  sizeBytes?: number | null;
  status?: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  downloadUrl?: string;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  previewMimeType?: string | null;
  caption?: string | null;
  createdAt?: string;
};

type PageInfo = { nextCursor?: string | null; hasMore?: boolean };

export async function fetchConversationNotes(params: { conversationId: string; limit?: number; search?: string; cursor?: string }): Promise<{ items: ConversationNote[]; pageInfo?: PageInfo }> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.cursor) query.set('cursor', params.cursor);
  const raw = query.toString();
  return apiFetch(`/conversations/${params.conversationId}/notes${raw ? `?${raw}` : ''}`);
}

export async function createConversationNote(conversationId: string, content: string): Promise<ConversationNote> {
  return apiFetch(`/conversations/${conversationId}/notes`, { method: 'POST', body: JSON.stringify({ content }) });
}

export async function updateConversationNote(conversationId: string, noteId: string, content: string): Promise<ConversationNote> {
  return apiFetch(`/conversations/${conversationId}/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify({ content }) });
}

export async function deleteConversationNote(conversationId: string, noteId: string): Promise<ConversationNote> {
  return apiFetch(`/conversations/${conversationId}/notes/${noteId}`, { method: 'DELETE' });
}

export async function fetchConversationTags(conversationId: string): Promise<{ items: ConversationTag[] }> {
  return apiFetch(`/conversations/${conversationId}/tags`);
}

export async function fetchWorkspaceTags(workspaceId?: string): Promise<{ items: ConversationTag[] }> {
  const query = new URLSearchParams();
  if (workspaceId) query.set('workspaceId', workspaceId);
  const raw = query.toString();
  return apiFetch(`/tags${raw ? `?${raw}` : ''}`);
}

export async function attachConversationTag(conversationId: string, tagId: string): Promise<any> {
  return apiFetch(`/conversations/${conversationId}/tags/${tagId}`, { method: 'PATCH' });
}

export async function detachConversationTag(conversationId: string, tagId: string): Promise<any> {
  return apiFetch(`/conversations/${conversationId}/tags/${tagId}`, { method: 'DELETE' });
}

export async function createConversationTag(conversationId: string, input: { text: string; color?: string }): Promise<any> {
  return apiFetch(`/conversations/${conversationId}/tags`, { method: 'POST', body: JSON.stringify(input) });
}

export async function updateCrmContact(contactId: string, input: { primaryPhone?: string | null; primaryEmail?: string | null; displayName?: string | null }): Promise<any> {
  return apiFetch(`/crm/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function fetchConversationAttachments(params: { conversationId: string; limit?: number; mediaType?: string; cursor?: string; search?: string }): Promise<{ items: ConversationAttachment[]; pageInfo?: PageInfo }> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.mediaType) query.set('mediaType', params.mediaType);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.search) query.set('search', params.search);
  const raw = query.toString();
  return apiFetch(`/conversations/${params.conversationId}/attachments${raw ? `?${raw}` : ''}`);
}
