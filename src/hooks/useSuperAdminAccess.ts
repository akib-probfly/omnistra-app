import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function useSuperAdminAccess() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['auth-user', session?.user.email],
    queryFn: () => apiFetch<{ role: string }>('/auth/me'),
    enabled: Boolean(session),
    staleTime: 60_000,
  });
  return { ...query, isSuperAdmin: Boolean(session && query.data?.role === 'super_admin') };
}
