import { apiFetch, apiUrl, uploadFile } from './client';

export type QuickReplyAttachment = {
  id: string;
  workspaceId?: string;
  mediaType?: string;
  mimeType?: string;
  originalName?: string | null;
  sizeBytes?: number | null;
  status?: string;
  downloadUrl?: string;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  localUri?: string;
};

export type QuickReplyChannelScope =
  | 'ALL'
  | 'WHATSAPP'
  | 'INSTAGRAM'
  | 'MESSENGER'
  | 'EMAIL'
  | 'WEBCHAT'
  | 'SMS'
  | 'TELEGRAM'
  | 'TIKTOK';

export type QuickReplySnippet = {
  id: string;
  workspaceId: string;
  title: string;
  shortcut?: string;
  body: string;
  category?: string | null;
  channelScope?: QuickReplyChannelScope | string;
  channelAccountIds?: string[];
  isActive: boolean;
  usageCount?: number;
  lastUsedAt?: string | null;
  attachments: QuickReplyAttachment[];
  createdAt?: string;
  updatedAt?: string;
};

export type QuickReplyListQuery = {
  workspaceId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
};

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function normalizeSnippet(snippet: QuickReplySnippet): QuickReplySnippet {
  return {
    ...snippet,
    attachments: snippet.attachments ?? [],
    channelAccountIds: snippet.channelAccountIds ?? [],
    channelScope: snippet.channelScope ?? 'ALL',
  };
}

export function channelScopeFromAccountTypes(types: Array<string | null | undefined>): QuickReplyChannelScope {
  const unique = [...new Set(types.map((type) => (type ?? '').toUpperCase()).filter(Boolean))];
  if (unique.length === 1 && unique[0] !== 'ALL') {
    return unique[0] as QuickReplyChannelScope;
  }
  return 'ALL';
}

export function formatQuickReplyChannelScope(scope?: string | null) {
  if (!scope || scope === 'ALL') return 'All channels';
  return scope.charAt(0) + scope.slice(1).toLowerCase();
}

export function isQuickReplyImageAttachment(attachment: QuickReplyAttachment) {
  const media = (attachment.mediaType ?? '').toUpperCase();
  const mime = (attachment.mimeType ?? '').toLowerCase();
  return media === 'IMAGE' || media === 'STICKER' || mime.startsWith('image/');
}

export function quickReplyAttachmentPreviewUrl(attachment: QuickReplyAttachment): string {
  if (attachment.localUri) return attachment.localUri;
  const resolved = apiUrl(attachment.previewUrl ?? attachment.thumbnailUrl ?? attachment.downloadUrl ?? null);
  if (resolved) return resolved;
  if (attachment.id && isQuickReplyImageAttachment(attachment)) {
    return apiUrl(`files/${attachment.id}/download`) ?? '';
  }
  return '';
}

export function getUnsupportedQuickReplyVariables(text: string) {
  const unsupported: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{(\w+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const full = match[0];
    if (seen.has(full)) continue;
    seen.add(full);
    if (match[1] !== 'name') unsupported.push(full);
  }
  return unsupported;
}

export function renderQuickReplyPreview(body: string, customerName = 'Alex') {
  return body.replace(/\{\{\s*name\s*\}\}/gi, customerName);
}

export async function fetchQuickRepliesList(query: QuickReplyListQuery) {
  const response = await apiFetch<{
    items: QuickReplySnippet[];
    pageInfo?: { nextCursor?: string | null; hasMore?: boolean };
  }>(`/quick-replies${buildQuery({
    workspaceId: query.workspaceId,
    search: query.search,
    cursor: query.cursor,
    limit: query.limit ?? 100,
  })}`);

  return {
    ...response,
    items: (response.items ?? []).map(normalizeSnippet),
  };
}

export async function createQuickReply(input: {
  workspaceId: string;
  title: string;
  body: string;
  isActive?: boolean;
  attachmentIds?: string[];
  channelScope?: QuickReplyChannelScope;
  channelAccountIds?: string[];
}) {
  return apiFetch<QuickReplySnippet>('/quick-replies', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      title: input.title,
      body: input.body,
      isActive: input.isActive ?? true,
      attachmentIds: input.attachmentIds,
      channelScope: input.channelScope ?? 'ALL',
    }),
  }).then(normalizeSnippet);
}

export async function updateQuickReply(input: {
  quickReplyId: string;
  workspaceId: string;
  title: string;
  body: string;
  isActive?: boolean;
  attachmentIds?: string[];
  channelScope?: QuickReplyChannelScope;
  channelAccountIds?: string[];
}) {
  return apiFetch<QuickReplySnippet>(`/quick-replies/${input.quickReplyId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      title: input.title,
      body: input.body,
      isActive: input.isActive ?? true,
      attachmentIds: input.attachmentIds,
      channelScope: input.channelScope ?? 'ALL',
    }),
  }).then(normalizeSnippet);
}

export async function fetchQuickReplyPicker(query: {
  workspaceId?: string;
  conversationId?: string;
  channelType?: string;
  search?: string;
  limit?: number;
}) {
  const response = await apiFetch<{
    recent?: QuickReplySnippet[];
    mostUsed?: QuickReplySnippet[];
    matching?: QuickReplySnippet[];
  }>(`/quick-replies/picker${buildQuery({
    workspaceId: query.workspaceId,
    conversationId: query.conversationId,
    channelType: query.channelType,
    search: query.search,
    limit: query.limit ?? 20,
  })}`);

  const seen = new Set<string>();
  const items: QuickReplySnippet[] = [];
  for (const group of [response.matching, response.recent, response.mostUsed]) {
    for (const snippet of group ?? []) {
      if (seen.has(snippet.id)) continue;
      seen.add(snippet.id);
      items.push(normalizeSnippet(snippet));
    }
  }
  return { items };
}

export async function deleteQuickReply(quickReplyId: string, workspaceId: string) {
  return apiFetch<QuickReplySnippet>(
    `/quick-replies/${quickReplyId}${buildQuery({ workspaceId })}`,
    { method: 'DELETE' },
  );
}

export async function uploadQuickReplyAttachment(workspaceId: string, uri: string, name: string, mimeType: string) {
  return uploadFile('/files/upload', uri, name, mimeType, { workspaceId }) as Promise<QuickReplyAttachment>;
}

export async function deleteWorkspaceFile(attachmentId: string) {
  return apiFetch<void>(`/files/${attachmentId}`, { method: 'DELETE' });
}
