import { apiFetch } from './client';

export type BillingPlanFeature = {
  key: string;
  kind?: string;
  label: string;
  status?: string;
  monthlyLabel?: string | null;
  yearlyLabel?: string | null;
  info?: string | null;
};

export type BillingPlan = {
  id: string;
  key: string;
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  currency: string;
  description: string;
  buttonLabel?: string;
  highlighted?: boolean;
  badge?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  features: BillingPlanFeature[];
};

export type WorkspaceUsage = {
  planKey: string;
  conversationCount: number;
  conversationLimit: number | null;
  seatCount: number;
  seatLimit: number | null;
  channelCount: number;
  channelLimit: number | null;
};

export type SubscriptionStatus = 'active' | 'changing' | 'canceled' | 'expired';

export type SubscriptionView = {
  id: string;
  workspaceId: string;
  planKey: string;
  billingCycle: 'MONTHLY' | 'YEARLY' | 'monthly' | 'yearly';
  status: SubscriptionStatus | string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  originalPlanKey?: string | null;
  pendingChangePlanKey?: string | null;
  canceledAt?: string | null;
  createdAt?: string;
  isTrial?: boolean;
};

export type WorkspaceBillingState = {
  planKey?: string | null;
  planName?: string | null;
  subscriptionStatus?: string | null;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
};

export type InvoiceStatus = 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED';

export type WorkspaceInvoice = {
  id: string;
  workspaceId: string;
  amountCents: number;
  currency: string;
  status: InvoiceStatus | string;
  provider?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  paidAt?: string | null;
  createdAt: string;
};

export async function fetchBillingPlans(): Promise<{ items: BillingPlan[] }> {
  return apiFetch('/billing/plans');
}

export async function fetchWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
  return apiFetch(`/billing/usage?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function fetchCurrentSubscription(workspaceId: string): Promise<{
  subscription: SubscriptionView | null;
  billingState?: WorkspaceBillingState | null;
}> {
  return apiFetch(`/billing/subscriptions/current?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function fetchSubscriptionHistory(workspaceId: string): Promise<{ items: SubscriptionView[] }> {
  return apiFetch(`/billing/subscriptions/history?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function fetchWorkspaceInvoices(params: {
  workspaceId: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: WorkspaceInvoice[]; nextCursor?: string | null; hasMore?: boolean }> {
  const query = new URLSearchParams({ workspaceId: params.workspaceId });
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit != null) query.set('limit', String(params.limit));
  return apiFetch(`/billing/invoices?${query.toString()}`);
}

export function formatCents(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return '—';
  const zeroDecimal = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
  const code = currency.trim().toUpperCase() || 'USD';
  const amount = zeroDecimal.has(code) ? cents : cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: zeroDecimal.has(code) ? 0 : 2,
      minimumFractionDigits: zeroDecimal.has(code) ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function formatBillingDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
