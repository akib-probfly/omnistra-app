import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  fetchNotificationPreferences,
  notificationQueryKeys,
} from '../api/notifications';
import { fetchMyWorkspaces } from '../api/workspaces';

export function useNotificationPreferences() {
  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspaceId = workspacesQuery.data?.items?.[0]?.id;

  const preferencesQuery = useQuery({
    queryKey: workspaceId
      ? notificationQueryKeys.preferences(workspaceId)
      : ['notifications', 'preferences', 'disabled'],
    queryFn: () => fetchNotificationPreferences(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  });

  return {
    ...(preferencesQuery.data ?? DEFAULT_NOTIFICATION_PREFERENCES),
    workspaceId: workspaceId ?? null,
    isLoaded: preferencesQuery.isSuccess || (!workspaceId && !workspacesQuery.isLoading),
    isLoading: workspacesQuery.isLoading || preferencesQuery.isLoading,
  };
}
