import { apiFetch } from './client';
import type { BillingPlan } from './billing';

export type AdminWorkspace = {
  id: string; name: string; status: string; ownerName: string | null;
  ownerEmail: string | null; planName: string | null; memberCount: number | null;
  expiresAt?: string | null; createdAt?: string | null;
};
export type AdminWorkspaceDetail = Partial<AdminWorkspace> & {
  id: string; name: string; description?: string | null; timezone?: string | null;
  billingPlanKey?: string | null; billingStatus?: string | null;
  billingCurrentPeriodEnd?: string | null;
  suspendedAt?: string | null;
  _count?: { members: number; channels: number; conversations: number };
  currentSubscription?: { planKey: string; status: string; billingCycle: string; currentPeriodEnd: string } | null;
};
export type AdminWorkspacePage = {
  items: AdminWorkspace[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
export const adminQueryKeys = {
  all: ['super-admin'] as const,
  workspaces: (search: string, status: string) => ['super-admin', 'workspaces', search, status] as const,
  workspace: (id: string | null) => ['super-admin', 'workspace', id] as const,
  plans: ['super-admin', 'plans'] as const,
};
export function fetchAdminWorkspaces(page: number, search: string, status: string) {
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (search.trim()) query.set('search', search.trim());
  if (status) query.set('status', status);
  return apiFetch<AdminWorkspacePage>(`/admin/workspaces?${query}`);
}
export function fetchAdminWorkspace(id: string) {
  return apiFetch<AdminWorkspaceDetail>(`/admin/workspaces/${encodeURIComponent(id)}`);
}
export function fetchAdminPlans() {
  return apiFetch<{ items: BillingPlan[] }>('/admin/billing/plans');
}
export type AdminWorkspaceAction = 'suspend' | 'reactivate' | 'reset-usage';
export function runAdminWorkspaceAction(id: string, action: AdminWorkspaceAction) {
  return apiFetch<unknown>(`/admin/workspaces/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
}
