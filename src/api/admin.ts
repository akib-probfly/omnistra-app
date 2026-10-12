import { apiFetch } from './client';
import type { BillingPlan } from './billing';
export type AdminPackageUpdate = Partial<Pick<BillingPlan, 'name' | 'description' | 'currency' | 'buttonLabel' | 'highlighted' | 'badge' | 'sortOrder' | 'isActive' | 'intervals'>>;
export function updateAdminPackage(key: string, input: AdminPackageUpdate) {
  return apiFetch<BillingPlan>(`/admin/billing/plans/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(input) });
}

export type AdminWorkspace = {
  id: string; name: string; status: string; ownerName: string | null;
  ownerEmail: string | null; planName: string | null; memberCount: number | null;
  expiresAt?: string | null; createdAt?: string | null;
};
export type AdminWorkspaceDetail = Partial<AdminWorkspace> & {
  id: string; name: string; description?: string | null; timezone?: string | null;
  billingPlanKey?: string | null; billingStatus?: string | null;
  billingCurrentPeriodEnd?: string | null;
  billingTrialEndsAt?: string | null;
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
  workspaces: (search: string, status: string, plan = '') => ['super-admin', 'workspaces', search, status, plan] as const,
  workspace: (id: string | null) => ['super-admin', 'workspace', id] as const,
  plans: ['super-admin', 'plans'] as const,
};
export function fetchAdminWorkspaces(page: number, search: string, status: string, plan = '') {
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (search.trim()) query.set('search', search.trim());
  if (status) query.set('status', status);
  if (plan) query.set('plan', plan);
  return apiFetch<AdminWorkspacePage>(`/admin/workspaces?${query}`);
}
export function fetchAdminWorkspace(id: string) {
  return apiFetch<AdminWorkspaceDetail>(`/admin/workspaces/${encodeURIComponent(id)}`);
}
export function fetchAdminPlans() {
  return apiFetch<{ items: BillingPlan[] }>('/admin/billing/plans');
}
export type AdminWorkspaceAction = 'suspend' | 'reactivate' | 'reset-usage';
export function updateAdminWorkspaceSubscription(input: { workspaceId: string; planKey: string; billingCycle: 'MONTHLY' | 'YEARLY'; expiresAt: string | null }) {
  const { workspaceId, expiresAt, ...fields } = input;
  return apiFetch<unknown>(`/admin/workspaces/${encodeURIComponent(workspaceId)}/subscriptions`, {
    method: 'PUT', body: JSON.stringify({ ...fields, expiresAt, currentPeriodEnd: expiresAt,
      billingCurrentPeriodEnd: expiresAt, billingTrialEndsAt: expiresAt, subscriptionExpiresAt: expiresAt }),
  });
}
export function runAdminWorkspaceAction(id: string, action: AdminWorkspaceAction) {
  return apiFetch<unknown>(`/admin/workspaces/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
}
