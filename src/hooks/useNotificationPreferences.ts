import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  fetchNotificationPreferences,
  notificationQueryKeys,
} from '../api/notifications';
import { fetchMyWorkspaces } from '../api/workspaces';
import { useAuth } from '../auth/AuthContext';

export function useNotificationPreferences() {
  const { session } = useAuth();
  const signedIn = Boolean(session?.accessToken);

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    enabled: signedIn,
    staleTime: 30_000,
    retry: false,
  });
  const workspaceId = workspacesQuery.data?.items?.[0]?.id;

  const preferencesQuery = useQuery({
    queryKey: workspaceId
      ? notificationQueryKeys.preferences(workspaceId)
      : ['notifications', 'preferences', 'disabled'],
    queryFn: () => fetchNotificationPreferences(workspaceId!),
    enabled: signedIn && Boolean(workspaceId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  return {
    ...(preferencesQuery.data ?? DEFAULT_NOTIFICATION_PREFERENCES),
    workspaceId: workspaceId ?? null,
    isLoaded: !signedIn || preferencesQuery.isSuccess || (!workspaceId && !workspacesQuery.isLoading),
    isLoading: signedIn && (workspacesQuery.isLoading || preferencesQuery.isLoading),
  };
}
