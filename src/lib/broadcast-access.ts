import type { Workspace } from '../api/workspaces';

const BROADCAST_ROLES = new Set(['super_admin', 'workspace_admin', 'workspace_manager']);

export function canViewBroadcast(workspace?: Pick<Workspace, 'roleKeys'> | null) {
  return (workspace?.roleKeys ?? []).some((role) => BROADCAST_ROLES.has(role));
}
