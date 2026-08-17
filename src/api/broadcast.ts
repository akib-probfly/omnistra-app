import { apiFetch } from './client';

export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';
export type CampaignChannelType = 'WHATSAPP';
export type CampaignContentType = 'TEMPLATE' | 'TEXT' | 'MEDIA';

export type BroadcastTemplateHeaderMedia = {
  attachmentId: string;
  headerType: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  fileName?: string | null;
  mimeType: string;
};
export type BroadcastTemplateHeaderMediaMap = Record<string, BroadcastTemplateHeaderMedia>;

export type BroadcastAudienceFilter = {
  includeTagIds: string[];
  excludeTagIds: string[];
  countryCodes: string[];
  createdAfter?: string;
  createdBefore?: string;
  assignTagIds: string[];
};

export type CampaignMessage = {
  id: string;
  campaignId: string;
  channelId: string;
  contentType: CampaignContentType;
  templateId: string | null;
  templateVariables: Record<string, string> | null;
  bodyText: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
};

export type CampaignAudienceMember = {
  id: string;
  campaignId: string;
  contactId: string;
  conversationId?: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  sentTemplateId?: string | null;
  sentTemplateName?: string | null;
  sentMessageText?: string | null;
  createdAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  repliedAt?: string | null;
  failedAt?: string | null;
  status?: string | null;
  failureReason?: string | null;
};

export type Campaign = {
  id: string;
  workspaceId: string;
  createdByUserId: string | null;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  name: string;
  description: string | null;
  channelType: CampaignChannelType;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  totalReplied: number;
  templateIds?: string[];
  templateVariablesMap?: Record<string, Record<string, string>> | null;
  templateHeaderMediaMap?: BroadcastTemplateHeaderMediaMap | null;
  broadcastSmartDelayEnabled?: boolean | null;
  broadcastDelaySeconds?: number | null;
  audienceFilter?: BroadcastAudienceFilter | null;
  messages: CampaignMessage[];
  audiences: CampaignAudienceMember[];
};

export type CampaignListResponse = {
  items: Campaign[];
  totalCount: number;
  pageInfo: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export type AudiencePreviewResponse = {
  items: CampaignAudienceMember[];
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type AggregatedAnalytics = {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalReplied: number;
  totalFailed: number;
};

export type CampaignListFilters = {
  search?: string;
  status?: CampaignStatus;
  channelType?: CampaignChannelType;
  createdByUserId?: string;
  cursor?: string;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'scheduledAt' | 'name' | 'totalRecipients';
  sortOrder?: 'asc' | 'desc';
};

export type CreateCampaignInput = {
  name: string;
  description?: string | null;
  channelType: CampaignChannelType;
  channelId: string;
  contentType: CampaignContentType;
  templateId?: string | null;
  templateVariables?: Record<string, string> | null;
  templateIds?: string[];
  templateVariablesMap?: Record<string, Record<string, string>>;
  templateHeaderMediaMap?: BroadcastTemplateHeaderMediaMap | null;
  broadcastSmartDelayEnabled?: boolean | null;
  broadcastDelaySeconds?: number | null;
  bodyText?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  contactIds?: string[];
  audienceFilter?: BroadcastAudienceFilter;
};

export type UpdateCampaignInput = {
  name?: string;
  description?: string | null;
  channelId?: string;
  contentType?: CampaignContentType;
  templateId?: string | null;
  templateVariables?: Record<string, string> | null;
  templateIds?: string[];
  templateVariablesMap?: Record<string, Record<string, string>>;
  templateHeaderMediaMap?: BroadcastTemplateHeaderMediaMap | null;
  broadcastSmartDelayEnabled?: boolean | null;
  broadcastDelaySeconds?: number | null;
  bodyText?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  audienceFilter?: BroadcastAudienceFilter;
};

export const EMPTY_AUDIENCE_FILTER: BroadcastAudienceFilter = {
  includeTagIds: [],
  excludeTagIds: [],
  countryCodes: [],
  assignTagIds: [],
};

export const broadcastQueryKeys = {
  all: ['broadcast'] as const,
  lists: () => [...broadcastQueryKeys.all, 'list'] as const,
  list: (filters: CampaignListFilters) => [...broadcastQueryKeys.lists(), filters] as const,
  details: () => [...broadcastQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...broadcastQueryKeys.details(), id] as const,
  audience: (id: string) => [...broadcastQueryKeys.all, 'audience', id] as const,
  analytics: () => [...broadcastQueryKeys.all, 'analytics'] as const,
};

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export async function fetchCampaigns(filters: CampaignListFilters = {}) {
  return apiFetch<CampaignListResponse>(`/broadcast/campaigns${buildQueryString({
    search: filters.search,
    status: filters.status,
    channelType: filters.channelType,
    createdByUserId: filters.createdByUserId,
    cursor: filters.cursor,
    limit: filters.limit,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  })}`);
}

export async function fetchCampaign(id: string) {
  return apiFetch<Campaign>(`/broadcast/campaigns/${id}`);
}

export async function createCampaign(data: CreateCampaignInput) {
  return apiFetch<Campaign>('/broadcast/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createCampaignDraft(data: CreateCampaignInput) {
  return apiFetch<Campaign>('/broadcast/campaigns/draft', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCampaign(id: string, data: UpdateCampaignInput) {
  return apiFetch<Campaign>(`/broadcast/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCampaign(id: string) {
  return apiFetch<void>(`/broadcast/campaigns/${id}`, { method: 'DELETE' });
}

export async function estimateBroadcastAudience(input: {
  channelId: string;
  contentType: CampaignContentType;
  audienceFilter: BroadcastAudienceFilter;
}) {
  return apiFetch<{ totalCount: number }>('/broadcast/audience/estimate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchCampaignAudience(
  campaignId: string,
  cursor?: string,
  limit?: number,
  search?: string,
  status?: string,
) {
  return apiFetch<AudiencePreviewResponse>(
    `/broadcast/campaigns/${campaignId}/audience${buildQueryString({ cursor, limit, search, status })}`,
  );
}

export async function scheduleCampaign(campaignId: string, scheduledAt: string) {
  return apiFetch<Campaign>(`/broadcast/campaigns/${campaignId}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  });
}

export async function sendCampaignNow(campaignId: string) {
  return apiFetch<Campaign>(`/broadcast/campaigns/${campaignId}/send-now`, { method: 'POST' });
}

export async function cancelCampaign(campaignId: string) {
  return apiFetch<Campaign>(`/broadcast/campaigns/${campaignId}/cancel`, { method: 'POST' });
}

export async function fetchBroadcastAnalytics() {
  return apiFetch<AggregatedAnalytics>('/broadcast/analytics');
}

export function getCampaignStatusLabel(status: CampaignStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'SCHEDULED':
      return 'Scheduled';
    case 'SENDING':
      return 'Sending';
    case 'SENT':
      return 'Sent';
    case 'FAILED':
      return 'Failed';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function getCampaignStatusTone(status: CampaignStatus): { bg: string; text: string } {
  switch (status) {
    case 'DRAFT':
      return { bg: '#f1f5f9', text: '#475569' };
    case 'SCHEDULED':
      return { bg: '#dbeafe', text: '#1d4ed8' };
    case 'SENDING':
      return { bg: '#fef3c7', text: '#b45309' };
    case 'SENT':
      return { bg: '#dcfce7', text: '#15803d' };
    case 'FAILED':
      return { bg: '#fee2e2', text: '#b91c1c' };
    case 'CANCELLED':
      return { bg: '#f1f5f9', text: '#64748b' };
  }
}

export function formatCampaignDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function toLocalDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function campaignUnreachedCount(campaign: Pick<Campaign, 'totalSent' | 'totalDelivered' | 'totalFailed'>) {
  return Math.max(0, campaign.totalSent - campaign.totalDelivered - campaign.totalFailed);
}
