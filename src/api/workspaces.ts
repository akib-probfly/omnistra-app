import { apiFetch } from './client';

export type Workspace = {
  id: string;
  name: string;
  timezone: string;
  broadcastSmartDelayEnabled?: boolean;
  broadcastDelaySeconds?: number;
  broadcastMultipleTemplateEnabled?: boolean;
  status?: 'ACTIVE' | 'INVITED' | 'DISABLED';
  roleKeys?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type TimezoneOption = {
  countryCode: string;
  countryName: string;
  zoneName: string;
  gmtOffset: number;
  dst: boolean;
  timestamp: number;
};

export async function fetchMyWorkspaces(): Promise<{ items: Workspace[] }> {
  return apiFetch('/workspaces/mine');
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  data: {
    name?: string;
    timezone?: string;
    broadcastSmartDelayEnabled?: boolean;
    broadcastDelaySeconds?: number;
    broadcastMultipleTemplateEnabled?: boolean;
  },
): Promise<Workspace> {
  return apiFetch(`/workspaces/${workspaceId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function fetchTimezones(countryName?: string): Promise<{ zones?: TimezoneOption[]; items?: TimezoneOption[] }> {
  const query = countryName?.trim()
    ? `?countryName=${encodeURIComponent(countryName.trim())}`
    : '';
  return apiFetch(`/timezone${query}`);
}

export type WorkspaceRosterMember = {
  id: string;
  kind?: 'MEMBER' | 'INVITE';
  workspaceId?: string;
  workspaceMemberId: string | null;
  userId: string | null;
  email: string;
  name: string | null;
  avatarUrl?: string | null;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  roleKeys?: string[];
  roleLabel?: string;
  accessScope?: 'ALL_CHANNELS' | 'ASSIGNED_CHANNELS' | null;
  canManageChannelAssignments?: boolean;
  limitToAssignedConversations?: boolean;
  channelAssignments?: Array<{
    channelId: string;
    channelName: string;
    channelType: string;
  }>;
  createdAt?: string;
  updatedAt?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
};

export async function fetchWorkspaceRosterMembers(
  workspaceId: string,
  search?: string,
  limit = 20,
): Promise<{ items: WorkspaceRosterMember[] }> {
  const query = new URLSearchParams({
    kind: 'ALL',
    page: '1',
    limit: String(limit),
  });
  if (search?.trim()) query.set('search', search.trim());
  return apiFetch(`/workspaces/${workspaceId}/roster?${query.toString()}`);
}

export function workspaceCanUpdateSettings(workspace?: Pick<Workspace, 'roleKeys'> | null) {
  const roles = workspace?.roleKeys ?? [];
  return roles.includes('workspace_admin') || roles.includes('workspace_manager');
}

export function formatGmtOffset(offsetSeconds: number) {
  const sign = offsetSeconds >= 0 ? '+' : '-';
  const absoluteSeconds = Math.abs(offsetSeconds);
  const hours = Math.floor(absoluteSeconds / 3600);
  const minutes = Math.floor((absoluteSeconds % 3600) / 60);
  return `GMT${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
