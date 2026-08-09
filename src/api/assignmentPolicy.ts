import { apiFetch } from './client';

export type WorkspaceAssignmentMode = 'UNASSIGNED' | 'DEFAULT_OWNER' | 'ROUND_ROBIN';

export type WorkspaceAssignmentOwner = {
  userId: string;
  email: string;
  name: string | null;
};

export type WorkspaceAssignmentPolicy = {
  workspaceId: string;
  enabled: boolean;
  mode: WorkspaceAssignmentMode;
  defaultOwnerUserId: string | null;
  defaultOwner: WorkspaceAssignmentOwner | null;
  onlyOnlineAgents: boolean;
  maxConversationsPerAgent: number | null;
  whatsappCallRoutingMode: 'BROADCAST' | 'ROUND_ROBIN';
  whatsappCallAssignedOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceAssignmentPolicyResponse = {
  workspaceId: string;
  workspaceName: string;
  policy: WorkspaceAssignmentPolicy | null;
};

export type UpdateWorkspaceAssignmentPolicyInput = {
  enabled?: boolean;
  mode?: WorkspaceAssignmentMode;
  defaultOwnerUserId?: string | null;
  onlyOnlineAgents?: boolean;
  maxConversationsPerAgent?: number | null;
  whatsappCallRoutingMode?: 'BROADCAST' | 'ROUND_ROBIN';
  whatsappCallAssignedOnly?: boolean;
};

export async function fetchWorkspaceAssignmentPolicy(workspaceId: string) {
  return apiFetch<WorkspaceAssignmentPolicyResponse>(`/workspaces/${workspaceId}/assignment-policy`);
}

export async function updateWorkspaceAssignmentPolicy(
  workspaceId: string,
  input: UpdateWorkspaceAssignmentPolicyInput,
) {
  return apiFetch<WorkspaceAssignmentPolicyResponse>(`/workspaces/${workspaceId}/assignment-policy`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
