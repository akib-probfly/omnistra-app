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

export type WorkspaceInviteRoleHint = 'MANAGER' | 'AGENT';

export type WorkspaceInviteItem = {
  id: string;
  email: string;
  roleHint: WorkspaceInviteRoleHint;
  inviteUrl: string;
  limitToAssignedConversations: boolean;
  expiresAt: string;
  createdAt: string;
  emailQueued: boolean;
  channelAssignments: Array<{
    channelId: string;
    channelName: string;
    channelType: string;
  }>;
};

export type WorkspaceInvitesCreateResponse = {
  workspaceId: string;
  workspaceName: string;
  items: WorkspaceInviteItem[];
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

export async function createWorkspaceInvites(values: {
  workspaceId: string;
  emails: string[];
  roleHint: WorkspaceInviteRoleHint;
  limitToAssignedConversations: boolean;
  channelIds: string[];
  sendEmail: boolean;
}): Promise<WorkspaceInvitesCreateResponse> {
  return apiFetch(`/workspaces/${values.workspaceId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      emails: values.emails,
      roleHint: values.roleHint,
      limitToAssignedConversations: values.limitToAssignedConversations,
      channelIds: values.channelIds,
      sendEmail: values.sendEmail,
    }),
  });
}

export type ValidateInviteEmailResponse = {
  exists: boolean;
  userExists: boolean;
  pendingInviteInAnyWorkspace: boolean;
  pendingInviteInThisWorkspace: boolean;
};

export async function validateInviteEmail(workspaceId: string, email: string): Promise<ValidateInviteEmailResponse> {
  return apiFetch(`/workspaces/${workspaceId}/invites/validate-email`, {
    method: 'POST',
    body: JSON.stringify({ email, workspaceId }),
  });
}

export function workspaceCanUpdateSettings(workspace?: Pick<Workspace, 'roleKeys'> | null) {
  const roles = workspace?.roleKeys ?? [];
  return roles.includes('workspace_admin') || roles.includes('workspace_manager');
}

export type WorkspaceMemberStatusUpdate = 'ACTIVE' | 'DISABLED';

export async function updateWorkspaceMemberChannelAssignments(values: {
  workspaceId: string;
  workspaceMemberId: string;
  channelIds: string[];
  limitToAssignedConversations: boolean;
}) {
  return apiFetch(`/workspaces/${values.workspaceId}/members/${values.workspaceMemberId}/channel-assignments`, {
    method: 'PATCH',
    body: JSON.stringify({
      channelIds: values.channelIds,
      limitToAssignedConversations: values.limitToAssignedConversations,
    }),
  });
}

export async function updateWorkspaceMemberRole(values: {
  workspaceId: string;
  workspaceMemberId: string;
  role: 'workspace_manager' | 'workspace_agent';
  limitToAssignedConversations: boolean;
}) {
  return apiFetch(`/workspaces/${values.workspaceId}/members/${values.workspaceMemberId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({
      role: values.role,
      limitToAssignedConversations: values.limitToAssignedConversations,
    }),
  });
}

export async function updateWorkspaceMemberStatus(values: {
  workspaceId: string;
  workspaceMemberId: string;
  status: WorkspaceMemberStatusUpdate;
}) {
  return apiFetch(`/workspaces/${values.workspaceId}/members/${values.workspaceMemberId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: values.status }),
  });
}

export async function deleteWorkspaceMember(values: {
  workspaceId: string;
  workspaceMemberId: string;
}) {
  return apiFetch<{ deleted: boolean }>(
    `/workspaces/${values.workspaceId}/members/${values.workspaceMemberId}`,
    { method: 'DELETE' },
  );
}

export async function refreshWorkspaceInviteLink(workspaceId: string, inviteId: string) {
  return apiFetch<{ inviteId: string; workspaceId: string; email: string; inviteUrl: string; expiresAt: string }>(
    `/workspaces/${workspaceId}/invites/${inviteId}/link`,
    { method: 'POST' },
  );
}

export async function deleteWorkspaceInvite(workspaceId: string, inviteId: string) {
  return apiFetch<{ deleted: boolean }>(
    `/workspaces/${workspaceId}/invites/${inviteId}`,
    { method: 'DELETE' },
  );
}

export function formatGmtOffset(offsetSeconds: number) {
  const sign = offsetSeconds >= 0 ? '+' : '-';
  const absoluteSeconds = Math.abs(offsetSeconds);
  const hours = Math.floor(absoluteSeconds / 3600);
  const minutes = Math.floor((absoluteSeconds % 3600) / 60);
  return `GMT${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
