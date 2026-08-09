import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Package, Receipt } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchBillingPlans,
  fetchCurrentSubscription,
  fetchSubscriptionHistory,
  fetchWorkspaceInvoices,
  fetchWorkspaceUsage,
  formatBillingDate,
  formatCents,
  type BillingPlan,
  type SubscriptionView,
  type WorkspaceInvoice,
} from '../api/billing';
import { fetchMyWorkspaces } from '../api/workspaces';
import { ErrorState } from '../components/ErrorState';
import type { SettingsStackParamList } from '../navigation/SettingsStack';

type BillingTab = 'current' | 'packages' | 'invoices' | 'history';

const TABS: Array<{ id: BillingTab; label: string }> = [
  { id: 'current', label: 'Current' },
  { id: 'packages', label: 'Packages' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'history', label: 'History' },
];

function usagePercent(count: number, limit: number | null) {
  if (limit == null || limit <= 0) return 0;
  return Math.min(100, Math.round((count / limit) * 100));
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value === 'active' || value === 'paid' || value === 'trialing') return { bg: '#ecfdf5', text: '#047857' };
  if (value === 'pending' || value === 'changing') return { bg: '#fff7ed', text: '#c2410c' };
  if (value === 'canceled' || value === 'expired' || value === 'failed') return { bg: '#fff1f2', text: '#e11d48' };
  return { bg: '#f1f5f9', text: '#475569' };
}

export function BillingSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SettingsStackParamList, 'Billing'>>();
  const initialTab = route.params?.tab ?? 'current';
  const [tab, setTab] = useState<BillingTab>(initialTab);

  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspaceId = workspacesQuery.data?.items?.[0]?.id;

  const subscriptionQuery = useQuery({
    queryKey: ['billing-subscription-current', workspaceId],
    queryFn: () => fetchCurrentSubscription(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });

  const usageQuery = useQuery({
    queryKey: ['billing-usage', workspaceId],
    queryFn: () => fetchWorkspaceUsage(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  const plansQuery = useQuery({
    queryKey: ['billing-plans'],
    queryFn: fetchBillingPlans,
    enabled: tab === 'packages',
    staleTime: 5 * 60_000,
  });

  const invoicesQuery = useQuery({
    queryKey: ['billing-invoices', workspaceId],
    queryFn: () => fetchWorkspaceInvoices({ workspaceId: workspaceId!, limit: 30 }),
    enabled: Boolean(workspaceId) && tab === 'invoices',
    staleTime: 60_000,
  });

  const historyQuery = useQuery({
    queryKey: ['billing-subscription-history', workspaceId],
    queryFn: () => fetchSubscriptionHistory(workspaceId!),
    enabled: Boolean(workspaceId) && tab === 'history',
    staleTime: 60_000,
  });

  const subscription = subscriptionQuery.data?.subscription ?? null;
  const billingState = subscriptionQuery.data?.billingState ?? null;
  const usage = usageQuery.data;
  const plans = useMemo(
    () => [...(plansQuery.data?.items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [plansQuery.data?.items],
  );
  const currentPlanKey = subscription?.planKey ?? billingState?.planKey ?? usage?.planKey ?? null;
  const planName = billingState?.planName
    ?? plans.find((plan) => plan.key === currentPlanKey)?.name
    ?? currentPlanKey
    ?? 'No plan';

  const refreshing = (
    workspacesQuery.isRefetching
    || subscriptionQuery.isRefetching
    || usageQuery.isRefetching
    || plansQuery.isRefetching
    || invoicesQuery.isRefetching
    || historyQuery.isRefetching
  );

  const onRefresh = () => {
    void workspacesQuery.refetch();
    if (workspaceId) {
      void subscriptionQuery.refetch();
      void usageQuery.refetch();
      if (tab === 'packages') void plansQuery.refetch();
      if (tab === 'invoices') void invoicesQuery.refetch();
      if (tab === 'history') void historyQuery.refetch();
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <ArrowLeft color="#0f172a" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Billing</Text>
          <Text style={styles.headerSubtitle}>Plans, invoices, and subscription history</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable key={item.id} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(item.id)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {workspacesQuery.isLoading ? (
        <ActivityIndicator color="#2563eb" style={styles.loader} />
      ) : workspacesQuery.isError || !workspaceId ? (
        <ErrorState
          message={workspacesQuery.error instanceof Error ? workspacesQuery.error.message : 'Unable to load workspace billing.'}
          onRetry={() => workspacesQuery.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
        >
          {tab === 'current' ? (
            subscriptionQuery.isLoading || usageQuery.isLoading ? (
              <ActivityIndicator color="#2563eb" style={styles.loader} />
            ) : subscriptionQuery.isError ? (
              <ErrorState message="Unable to load current plan." onRetry={() => subscriptionQuery.refetch()} />
            ) : (
              <>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <CreditCard color="#2563eb" size={18} />
                    <Text style={styles.cardTitle}>Current plan</Text>
                  </View>
                  <Text style={styles.planName}>{planName}</Text>
                  <Text style={styles.muted}>
                    {subscription
                      ? `${String(subscription.billingCycle).toLowerCase()} · ${String(subscription.status)}`
                      : billingState?.subscriptionStatus ?? billingState?.trialEndsAt
                        ? 'Trial / billing state'
                        : 'No active subscription'}
                  </Text>
                  {subscription ? (
                    <Text style={styles.muted}>
                      Period: {formatBillingDate(subscription.currentPeriodStart)} – {formatBillingDate(subscription.currentPeriodEnd)}
                    </Text>
                  ) : billingState?.trialEndsAt ? (
                    <Text style={styles.muted}>Trial ends {formatBillingDate(billingState.trialEndsAt)}</Text>
                  ) : null}
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Usage</Text>
                  <UsageRow label="Conversations" count={usage?.conversationCount ?? 0} limit={usage?.conversationLimit ?? null} />
                  <UsageRow label="Team seats" count={usage?.seatCount ?? 0} limit={usage?.seatLimit ?? null} />
                  <UsageRow label="Channels" count={usage?.channelCount ?? 0} limit={usage?.channelLimit ?? null} />
                </View>
              </>
            )
          ) : null}

          {tab === 'packages' ? (
            plansQuery.isLoading ? (
              <ActivityIndicator color="#2563eb" style={styles.loader} />
            ) : plansQuery.isError ? (
              <ErrorState message="Unable to load packages." onRetry={() => plansQuery.refetch()} />
            ) : (
              plans.map((plan, planIndex) => (
                <PlanCard
                  key={plan.id || plan.key || `plan-${planIndex}`}
                  plan={plan}
                  isCurrent={plan.key === currentPlanKey}
                />
              ))
            )
          ) : null}

          {tab === 'invoices' ? (
            invoicesQuery.isLoading ? (
              <ActivityIndicator color="#2563eb" style={styles.loader} />
            ) : invoicesQuery.isError ? (
              <ErrorState message="Unable to load invoices." onRetry={() => invoicesQuery.refetch()} />
            ) : (invoicesQuery.data?.items?.length ?? 0) === 0 ? (
              <View style={styles.emptyCard}>
                <Receipt color="#94a3b8" size={28} />
                <Text style={styles.emptyTitle}>No invoices yet</Text>
                <Text style={styles.emptyBody}>Paid invoices for this workspace will appear here.</Text>
              </View>
            ) : (
              (invoicesQuery.data?.items ?? []).map((invoice, invoiceIndex) => (
                <InvoiceRow key={invoice.id || `invoice-${invoiceIndex}`} invoice={invoice} />
              ))
            )
          ) : null}

          {tab === 'history' ? (
            historyQuery.isLoading ? (
              <ActivityIndicator color="#2563eb" style={styles.loader} />
            ) : historyQuery.isError ? (
              <ErrorState message="Unable to load subscription history." onRetry={() => historyQuery.refetch()} />
            ) : (historyQuery.data?.items?.length ?? 0) === 0 ? (
              <View style={styles.emptyCard}>
                <Package color="#94a3b8" size={28} />
                <Text style={styles.emptyTitle}>No subscription history</Text>
                <Text style={styles.emptyBody}>Past subscriptions for this workspace will show up here.</Text>
              </View>
            ) : (
              (historyQuery.data?.items ?? []).map((item, historyIndex) => (
                <HistoryRow key={item.id || `history-${historyIndex}`} item={item} />
              ))
            )
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function UsageRow({ label, count, limit }: { label: string; count: number; limit: number | null }) {
  const percent = usagePercent(count, limit);
  return (
    <View style={styles.usageRow}>
      <View style={styles.usageHeader}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={styles.usageValue}>{count}{limit == null ? '' : ` / ${limit}`}</Text>
      </View>
      <View style={styles.usageTrack}>
        <View style={[styles.usageFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

function PlanCard({ plan, isCurrent }: { plan: BillingPlan; isCurrent: boolean }) {
  return (
    <View style={[styles.card, isCurrent && styles.cardHighlight]}>
      <View style={styles.planHeader}>
        <Text style={styles.planName}>{plan.name}</Text>
        {isCurrent ? <Text style={styles.currentBadge}>Current</Text> : null}
      </View>
      <Text style={styles.priceLine}>{plan.monthlyPrice} / month</Text>
      <Text style={styles.muted}>{plan.yearlyPrice} billed yearly</Text>
      <Text style={styles.cardBody}>{plan.description}</Text>
      {(plan.features ?? []).slice(0, 5).map((feature, featureIndex) => (
        <Text
          key={`${plan.id || plan.key}-${feature.key || feature.label || 'feature'}-${featureIndex}`}
          style={styles.featureLine}
        >
          • {feature.monthlyLabel ?? feature.label}
        </Text>
      ))}
    </View>
  );
}

function InvoiceRow({ invoice }: { invoice: WorkspaceInvoice }) {
  const tone = statusTone(String(invoice.status));
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.planName}>{formatCents(invoice.amountCents, invoice.currency)}</Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.text }]}>{String(invoice.status)}</Text>
        </View>
      </View>
      <Text style={styles.muted}>{formatBillingDate(invoice.paidAt ?? invoice.createdAt)}</Text>
      {(invoice.periodStart || invoice.periodEnd) ? (
        <Text style={styles.muted}>
          {formatBillingDate(invoice.periodStart)} – {formatBillingDate(invoice.periodEnd)}
        </Text>
      ) : null}
    </View>
  );
}

function HistoryRow({ item }: { item: SubscriptionView }) {
  const tone = statusTone(String(item.status));
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.planName}>{item.planKey}</Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.text }]}>{String(item.status)}</Text>
        </View>
      </View>
      <Text style={styles.muted}>{String(item.billingCycle).toLowerCase()}</Text>
      <Text style={styles.muted}>
        {formatBillingDate(item.currentPeriodStart)} – {formatBillingDate(item.currentPeriodEnd)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 12, paddingHorizontal: 14 },
  backButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  tabs: { backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  tab: { backgroundColor: '#f1f5f9', borderRadius: 999, flex: 1, paddingHorizontal: 8, paddingVertical: 8 },
  tabActive: { backgroundColor: '#dbeafe' },
  tabText: { color: '#64748b', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  tabTextActive: { color: '#1d4ed8', fontWeight: '700' },
  loader: { marginTop: 60 },
  content: { gap: 12, padding: 16 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, padding: 16 },
  cardHighlight: { borderColor: '#2563eb' },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 },
  cardTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  cardBody: { color: '#64748b', fontSize: 13, marginTop: 8 },
  planName: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  priceLine: { color: '#2563eb', fontSize: 16, fontWeight: '800', marginTop: 6 },
  muted: { color: '#64748b', fontSize: 12, marginTop: 4 },
  usageRow: { marginTop: 12 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  usageLabel: { color: '#334155', fontSize: 13, fontWeight: '600' },
  usageValue: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  usageTrack: { backgroundColor: '#e2e8f0', borderRadius: 999, height: 8, marginTop: 6, overflow: 'hidden' },
  usageFill: { backgroundColor: '#2563eb', height: 8 },
  planHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  currentBadge: { backgroundColor: '#dbeafe', borderRadius: 999, color: '#1d4ed8', fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  featureLine: { color: '#475569', fontSize: 13, marginTop: 6 },
  emptyCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, padding: 28 },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyBody: { color: '#64748b', fontSize: 13, marginTop: 4, textAlign: 'center' },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
