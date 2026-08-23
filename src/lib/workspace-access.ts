import { useQuery } from '@tanstack/react-query';
import { fetchMyWorkspaces, type Workspace } from '../api/workspaces';

const MANAGEMENT_ROLES = new Set(['super_admin', 'workspace_admin', 'workspace_manager']);

export function canManageWorkspace(workspace?: Pick<Workspace, 'roleKeys'> | null) {
  return (workspace?.roleKeys ?? []).some((role) => MANAGEMENT_ROLES.has(role));
}

/** Current workspace plus the role checks that drive navigation and settings visibility. */
export function useWorkspaceAccess() {
  const query = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspace = query.data?.items?.[0] ?? null;
  return {
    workspace,
    loading: query.isPending,
    canManage: canManageWorkspace(workspace),
  };
}
