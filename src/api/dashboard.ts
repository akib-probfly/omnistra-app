import { apiFetch } from './client';

export type DashboardSummary = {
  totalConversations: number;
  uniqueContactsCreated: number;
  openConversations: number;
  assignedConversations: number;
  unassignedConversations: number;
  closedConversations: number;
  unrepliedConversations: number;
  overdueConversations: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  resolutionRate: number;
  unreadNotifications: number;
  activeCalls: number;
  messagesInRange: number;
};

export type DashboardTrendPoint = {
  date: string;
  incoming: number;
  resolved: number;
  open: number;
  unreplied: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
};

export type DashboardChannelMixItem = {
  channelType: string;
  total: number;
  open: number;
  resolved: number;
  unreplied: number;
};

export type DashboardChannelHealthItem = {
  channelId: string;
  channelName: string;
  channelType: string;
  channelStatus: string;
  lifecycleState?: string | null;
  accountStatus: string | null;
  lastWebhookError: string | null;
  activeAccounts: number;
  connectedAccounts: number;
  disconnectedAccounts: number;
  messagesInRange: number;
};

export type DashboardTeamCommandCenterMember = {
  workspaceMemberId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userAvatarUrl: string | null;
  roleKeys: string[];
  online: boolean;
  onlineStatus: 'ONLINE' | 'OFFLINE';
  assignedConversations: number;
  openConversations: number;
  repliedConversations: number;
  unrepliedConversations: number;
  overdueConversations: number;
  resolvedConversations: number;
  replyProgressPercent: number;
  isAtCapacity: boolean;
  capacityLimit: number | null;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
};

export type DashboardTeamCommandCenter = {
  filters: { all: number; online: number; offline: number; available: number };
  summary: {
    totalMembers: number;
    onlineMembers: number;
    offlineMembers: number;
    availableNowMembers: number;
    totalAssignedConversations: number;
    totalOpenConversations: number;
    totalRepliedConversations: number;
    avgResponseMinutes: number | null;
    replyProgressPercent: number;
  };
  members: DashboardTeamCommandCenterMember[];
};

export type DashboardResponse = {
  scope: {
    workspaceId: string;
    workspaceName: string | null;
    role: string;
  };
  summary: DashboardSummary;
  trends: { conversationVolume: DashboardTrendPoint[] };
  channelMix: DashboardChannelMixItem[];
  channelHealth: DashboardChannelHealthItem[];
  agentPerformance: Array<Record<string, unknown>>;
  teamCommandCenter: DashboardTeamCommandCenter;
  recentConversations: Array<Record<string, unknown>>;
  attentionQueue: Array<Record<string, unknown>>;
  activeCalls: Array<Record<string, unknown>>;
  routingContext: unknown;
};

export type FetchDashboardQuery = {
  workspaceId?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
};

export async function fetchDashboard(params: FetchDashboardQuery = {}): Promise<DashboardResponse> {
  const query = new URLSearchParams();
  if (params.workspaceId) query.set('workspaceId', params.workspaceId);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.search) query.set('search', params.search);
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  const qs = query.toString();
  return apiFetch<DashboardResponse>(`/dashboard${qs ? `?${qs}` : ''}`);
}
