import { apiFetch, uploadFile } from './client';

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
};

export type QuickReplySnippet = {
  id: string;
  workspaceId: string;
  title: string;
  shortcut?: string;
  body: string;
  category?: string | null;
  channelScope?: string;
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
  };
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
}) {
  return apiFetch<QuickReplySnippet>('/quick-replies', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      title: input.title,
      body: input.body,
      isActive: input.isActive ?? true,
      attachmentIds: input.attachmentIds,
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
}) {
  return apiFetch<QuickReplySnippet>(`/quick-replies/${input.quickReplyId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      workspaceId: input.workspaceId,
      title: input.title,
      body: input.body,
      isActive: input.isActive ?? true,
      attachmentIds: input.attachmentIds,
    }),
  }).then(normalizeSnippet);
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
