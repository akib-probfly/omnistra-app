import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Check, CreditCard, Package, Receipt, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { ScreenHeader } from '../ui';
import {
  confirmReturnedPipraPayPayment,
  fetchBillingPlans,
  fetchCurrentSubscription,
  fetchSubscriptionHistory,
  fetchWorkspaceInvoices,
  fetchWorkspaceUsage,
  formatBillingDate,
  formatCents,
  formatFeatureLabel,
  getPlanFeatures,
  getPlanInterval,
  getPlanPrice,
  type BillingInterval,
  type BillingPlan,
  type SubscriptionView,
  type WorkspaceInvoice,
  type WorkspaceUsage,
} from '../api/billing';
import { fetchMyWorkspaces } from '../api/workspaces';
import { ErrorState } from '../components/ErrorState';
import { CardGridSkeleton, FormSkeleton, PanelSkeleton } from '../components/Skeleton';
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

function formatNumber(value: number) {
  return value.toLocaleString('en-US');
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isLiveSubscriptionStatus(status?: string | null) {
  const value = (status ?? '').toLowerCase();
  return value === 'active' || value === 'changing' || value === 'trialing';
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value === 'active' || value === 'paid' || value === 'trialing') return { bg: '#ecfdf5', text: '#047857' };
  if (value === 'pending' || value === 'changing' || value === 'canceled') return { bg: '#fff7ed', text: '#c2410c' };
  if (value === 'expired' || value === 'failed') return { bg: '#fff1f2', text: '#e11d48' };
  return { bg: '#f1f5f9', text: '#475569' };
}

export function BillingSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const route = useRoute<RouteProp<SettingsStackParamList, 'Billing'>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const initialTab = route.params?.tab ?? 'current';
  const [tab, setTab] = useState<BillingTab>(initialTab);
  const [packageCycle, setPackageCycle] = useState<BillingInterval>('monthly');
  const handledCheckoutRef = useRef<string | null>(null);

  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspaceId = workspacesQuery.data?.items?.[0]?.id;

  useEffect(() => {
    const checkout = route.params?.checkout;
    if (!checkout || !workspaceId) return;
    const key = `${checkout}:${route.params?.reference ?? ''}:${route.params?.planKey ?? ''}`;
    if (handledCheckoutRef.current === key) return;
    handledCheckoutRef.current = key;

    const run = async () => {
      if (checkout === 'success') {
        try {
          if (route.params?.reference) {
            await confirmReturnedPipraPayPayment(workspaceId, route.params.reference);
          }
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['billing-subscription-current', workspaceId] }),
            queryClient.invalidateQueries({ queryKey: ['billing-usage', workspaceId] }),
            queryClient.invalidateQueries({ queryKey: ['billing-invoices', workspaceId] }),
            queryClient.invalidateQueries({ queryKey: ['billing-subscription-history', workspaceId] }),
          ]);
          Toast.show({ type: 'success', text1: 'Payment received', text2: 'Your subscription is being updated.' });
          setTab('current');
        } catch (error) {
          Toast.show({
            type: 'error',
            text1: 'Could not confirm payment',
            text2: error instanceof Error ? error.message : 'Refresh billing and try again.',
          });
        }
      } else {
        Toast.show({ type: 'info', text1: 'Checkout canceled', text2: 'No changes were made to your plan.' });
        setTab('packages');
      }
      navigation.setParams({ checkout: undefined, reference: undefined, planKey: undefined });
    };

    void run();
  }, [navigation, queryClient, route.params?.checkout, route.params?.planKey, route.params?.reference, workspaceId]);

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
    enabled: tab === 'packages' || tab === 'current',
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
  const hasLiveSubscription = isLiveSubscriptionStatus(subscription?.status);
  const hasLiveBillingState = isLiveSubscriptionStatus(billingState?.subscriptionStatus);
  const currentPlanKey = hasLiveSubscription
    ? subscription?.planKey ?? billingState?.planKey ?? usage?.planKey ?? null
    : hasLiveBillingState
      ? billingState?.planKey ?? subscription?.planKey ?? usage?.planKey ?? null
      : subscription?.planKey ?? billingState?.planKey ?? usage?.planKey ?? null;
  const currentPlan = plans.find((plan) => plan.key === currentPlanKey) ?? null;
  const planName = billingState?.planName
    ?? currentPlan?.name
    ?? currentPlanKey
    ?? 'No plan';
  const billingCycle = (subscription?.billingCycle ?? 'MONTHLY').toString().toLowerCase();
  const resolvedStatus = (
    hasLiveSubscription
      ? subscription?.status ?? billingState?.subscriptionStatus
      : hasLiveBillingState
        ? billingState?.subscriptionStatus ?? subscription?.status
        : subscription?.status ?? billingState?.subscriptionStatus
  ) ?? null;
  const isTrialing = (
    (resolvedStatus ?? '').toLowerCase() === 'trialing'
    || (subscription?.isTrial === true && Boolean(billingState?.trialEndsAt))
  );
  const isExpired = (resolvedStatus ?? '').toLowerCase() === 'expired'
    || (billingState?.subscriptionStatus ?? '').toLowerCase() === 'expired';
  const periodEnd = subscription?.currentPeriodEnd ?? billingState?.subscriptionEndsAt ?? null;
  const planPrice = getPlanPrice(currentPlan, billingCycle);
  const planPriceSuffix = billingCycle === 'yearly' ? '/yr' : '/mo';
  const pendingChangePlanKey = subscription?.pendingChangePlanKey ?? billingState?.pendingChangePlanKey ?? null;
  const hasScheduledDowngrade = Boolean(pendingChangePlanKey);
  const pendingChangePlanName = plans.find((plan) => plan.key === pendingChangePlanKey)?.name ?? pendingChangePlanKey;

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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Billing"
        subtitle="Plans, invoices, and subscription history"
        onBack={() => navigation.goBack()}
      />

      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable key={item.id} style={[styles.tab, { backgroundColor: colors.surfaceSecondary }, active && styles.tabActive]} onPress={() => setTab(item.id)}>
              <Text style={[styles.tabText, { color: colors.textSecondary }, active && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {workspacesQuery.isLoading ? (
        <FormSkeleton fields={5} />
      ) : workspacesQuery.isError || !workspaceId ? (
        <ErrorState
          message={workspacesQuery.error instanceof Error ? workspacesQuery.error.message : 'Unable to load workspace billing.'}
          onRetry={() => workspacesQuery.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {tab === 'current' ? (
            subscriptionQuery.isLoading || usageQuery.isLoading ? (
              <FormSkeleton fields={4} />
            ) : subscriptionQuery.isError ? (
              <ErrorState message="Unable to load current plan." onRetry={() => subscriptionQuery.refetch()} />
            ) : (
              <CurrentPlanSection
                planName={planName}
                planPrice={planPrice}
                planPriceSuffix={planPriceSuffix}
                billingCycle={billingCycle}
                resolvedStatus={resolvedStatus}
                isTrialing={isTrialing}
                isExpired={isExpired}
                periodStart={subscription?.currentPeriodStart ?? billingState?.trialStartedAt ?? null}
                periodEnd={periodEnd}
                trialEndsAt={billingState?.trialEndsAt ?? null}
                pendingChangePlanKey={subscription?.pendingChangePlanKey ?? null}
                pendingChangePlanName={
                  plans.find((plan) => plan.key === subscription?.pendingChangePlanKey)?.name
                  ?? subscription?.pendingChangePlanKey
                  ?? null
                }
                usage={usage ?? null}
                onBrowsePackages={() => setTab('packages')}
              />
            )
          ) : null}

          {tab === 'packages' ? (
            plansQuery.isLoading ? (
              <CardGridSkeleton cards={3} />
            ) : plansQuery.isError ? (
              <ErrorState message="Unable to load packages." onRetry={() => plansQuery.refetch()} />
            ) : (
              <>
                <View style={styles.packagesIntro}>
                  <Text style={[styles.packagesTitle, { color: colors.text }]}>Build the perfect customer experience suite</Text>
                  <Text style={[styles.packagesSubtitle, { color: colors.textSecondary }]}>
                    Unify Customer Service, Generative AI Chatbot, Workflows, and Campaign Management into one subscription.
                  </Text>
                  <View style={[styles.cycleToggle, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                    {(['monthly', 'yearly'] as const).map((cycle) => {
                      const active = packageCycle === cycle;
                      return (
                        <Pressable
                          key={cycle}
                          style={[styles.cycleOption, active && { backgroundColor: colors.primary }]}
                          onPress={() => setPackageCycle(cycle)}
                        >
                          <Text style={[styles.cycleOptionText, { color: colors.textSecondary }, active && styles.cycleOptionTextActive]}>
                            {cycle === 'monthly' ? 'Pay monthly' : 'Pay yearly'}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.saveBadge}>
                      <Text style={styles.saveBadgeText}>Save 15%</Text>
                    </View>
                  </View>
                </View>

                {hasScheduledDowngrade ? (
                  <View style={styles.warnBanner}>
                    <AlertTriangle color="#d97706" size={16} />
                    <Text style={styles.warnBannerText}>
                      A downgrade to {pendingChangePlanName} is already scheduled. Package changes are locked until that plan becomes active.
                    </Text>
                  </View>
                ) : null}

                {plans.map((plan, planIndex) => {
                  const isCurrent = plan.key === currentPlanKey;
                  return (
                    <PlanCard
                      key={plan.id || plan.key || `plan-${planIndex}`}
                      plan={plan}
                      cycle={packageCycle}
                      isCurrent={isCurrent}
                      isCurrentTrial={isCurrent && isTrialing}
                      hasScheduledDowngrade={hasScheduledDowngrade}
                      onPress={() => {
                        if (!workspaceId) return;
                        navigation.navigate('BillingPlanDetails', {
                          planKey: plan.key,
                          workspaceId,
                          cycle: packageCycle,
                        });
                      }}
                    />
                  );
                })}
              </>
            )
          ) : null}

          {tab === 'invoices' ? (
            invoicesQuery.isLoading ? (
              <PanelSkeleton rows={5} />
            ) : invoicesQuery.isError ? (
              <ErrorState message="Unable to load invoices." onRetry={() => invoicesQuery.refetch()} />
            ) : (invoicesQuery.data?.items?.length ?? 0) === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <Receipt color={colors.textMuted} size={28} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No invoices yet</Text>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Paid invoices for this workspace will appear here.</Text>
              </View>
            ) : (
              (invoicesQuery.data?.items ?? []).map((invoice, invoiceIndex) => (
                <InvoiceRow key={invoice.id || `invoice-${invoiceIndex}`} invoice={invoice} />
              ))
            )
          ) : null}

          {tab === 'history' ? (
            historyQuery.isLoading ? (
              <PanelSkeleton rows={5} />
            ) : historyQuery.isError ? (
              <ErrorState message="Unable to load subscription history." onRetry={() => historyQuery.refetch()} />
            ) : (historyQuery.data?.items?.length ?? 0) === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <Package color={colors.textMuted} size={28} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No subscription history</Text>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Past subscriptions for this workspace will show up here.</Text>
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

function CurrentPlanSection({
  planName,
  planPrice,
  planPriceSuffix,
  billingCycle,
  resolvedStatus,
  isTrialing,
  isExpired,
  periodStart,
  periodEnd,
  trialEndsAt,
  pendingChangePlanKey,
  pendingChangePlanName,
  usage,
  onBrowsePackages,
}: {
  planName: string;
  planPrice: string | null;
  planPriceSuffix: string;
  billingCycle: string;
  resolvedStatus: string | null;
  isTrialing: boolean;
  isExpired: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  trialEndsAt: string | null;
  pendingChangePlanKey: string | null;
  pendingChangePlanName: string | null;
  usage: WorkspaceUsage | null;
  onBrowsePackages: () => void;
}) {
  const { colors } = useTheme();
  const statusLabel = isTrialing
    ? 'Free Trial'
    : resolvedStatus
      ? titleCase(String(resolvedStatus))
      : 'No plan';
  const statusColors = isTrialing
    ? { bg: '#2563eb', text: '#fff' }
    : statusTone(resolvedStatus ?? 'none');
  const subtitle = isTrialing && trialEndsAt
    ? `Trial ends ${formatBillingDate(trialEndsAt)}`
    : periodEnd
      ? isExpired
        ? `Ended ${formatBillingDate(periodEnd)}`
        : `Next billing date: ${formatBillingDate(periodEnd)}`
      : 'No billing period available';

  return (
    <>
      <View style={[styles.planHero, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, isExpired && styles.planHeroExpired]}>
        <View style={styles.planHeroTop}>
          <View style={[styles.planHeroIcon, { backgroundColor: colors.surfaceSecondary }]}>
            {isTrialing ? <Sparkles color={colors.primary} size={18} /> : <CreditCard color={colors.primary} size={18} />}
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
            <Text style={[styles.statusPillText, { color: statusColors.text }]}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={[styles.planHeroEyebrow, { color: colors.textSecondary }]}>
          {isTrialing ? 'Trial' : isExpired ? 'Subscription expired' : 'Current plan'}
        </Text>
        <Text style={[styles.planHeroName, { color: colors.text }]}>{planName}</Text>
        <Text style={[styles.planHeroSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>

        {planPrice ? (
          <View style={[styles.priceChip, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
            <Text style={[styles.priceChipValue, { color: colors.primary }]}>{planPrice}</Text>
            <Text style={[styles.priceChipSuffix, { color: colors.textSecondary }]}>{planPriceSuffix}</Text>
            <Text style={[styles.priceChipCycle, { color: colors.textMuted }]}>· {titleCase(billingCycle)}</Text>
          </View>
        ) : null}

        {(periodStart || periodEnd) ? (
          <View style={styles.metaRow}>
            <CalendarDays color={colors.textSecondary} size={14} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {formatBillingDate(periodStart)} – {formatBillingDate(periodEnd)}
            </Text>
          </View>
        ) : null}

        {pendingChangePlanKey && !isTrialing ? (
          <View style={styles.warnBanner}>
            <AlertTriangle color="#d97706" size={16} />
            <Text style={styles.warnBannerText}>
              Scheduled to change to {pendingChangePlanName ?? pendingChangePlanKey} at the end of this billing period.
            </Text>
          </View>
        ) : null}

        {isExpired ? (
          <View style={styles.dangerBanner}>
            <AlertTriangle color="#e11d48" size={16} />
            <Text style={styles.dangerBannerText}>
              This subscription has expired. Renew or choose a package to restore full access.
            </Text>
          </View>
        ) : null}

        <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={onBrowsePackages}>
          <Text style={styles.primaryButtonText}>
            {isExpired || isTrialing ? 'View packages' : 'Change plan'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, isExpired && styles.usageCardExpired]}>
        <View style={styles.usageTitleRow}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Current usage</Text>
          {isExpired ? (
            <View style={[styles.statusPill, { backgroundColor: '#fffbeb' }]}>
              <Text style={[styles.statusPillText, { color: '#b45309' }]}>Expired snapshot</Text>
            </View>
          ) : null}
        </View>
        {isExpired ? (
          <View style={styles.warnBanner}>
            <AlertTriangle color="#d97706" size={16} />
            <Text style={styles.warnBannerText}>
              Usage is shown against the expired plan. Renew to bring the workspace back into an active billing state.
            </Text>
          </View>
        ) : null}
        <UsageRow label="Conversations" count={usage?.conversationCount ?? 0} limit={usage?.conversationLimit ?? null} />
        <UsageRow label="Team members" count={usage?.seatCount ?? 0} limit={usage?.seatLimit ?? null} />
        <UsageRow label="Channels" count={usage?.channelCount ?? 0} limit={usage?.channelLimit ?? null} />
      </View>
    </>
  );
}

function UsageRow({ label, count, limit }: { label: string; count: number; limit: number | null }) {
  const { colors } = useTheme();
  const percent = usagePercent(count, limit);
  const isNearLimit = limit != null && percent >= 80 && percent < 100;
  const isOverLimit = limit != null && percent >= 100;
  const fillColor = isOverLimit ? '#f43f5e' : isNearLimit ? '#f59e0b' : '#2563eb';
  const valueLabel = limit == null
    ? `${formatNumber(count)} / Unlimited`
    : `${formatNumber(count)} / ${formatNumber(limit)}`;

  return (
    <View style={[styles.usageCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={styles.usageHeader}>
        <Text style={[styles.usageLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.usageValue, { color: colors.textSecondary }]}>{valueLabel}</Text>
      </View>
      {limit != null ? (
        <>
          <View style={[styles.usageTrack, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={[styles.usageFill, { width: `${percent}%`, backgroundColor: fillColor }]} />
          </View>
          {isOverLimit ? (
            <Text style={styles.usageHintDanger}>Limit exceeded. Some features may be restricted.</Text>
          ) : isNearLimit ? (
            <Text style={styles.usageHintWarn}>{formatNumber(Math.max(0, limit - count))} remaining.</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function PlanCard({
  plan,
  cycle,
  isCurrent,
  isCurrentTrial,
  hasScheduledDowngrade,
  onPress,
}: {
  plan: BillingPlan;
  cycle: BillingInterval;
  isCurrent: boolean;
  isCurrentTrial: boolean;
  hasScheduledDowngrade: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const unavailable = Boolean(plan.intervals) && !getPlanInterval(plan, cycle);
  const price = unavailable ? 'Unavailable' : getPlanPrice(plan, cycle) ?? '—';
  const features = getPlanFeatures(plan, cycle).slice(0, 5);
  const disabled = unavailable || hasScheduledDowngrade || (isCurrent && !isCurrentTrial);
  const cta = unavailable
    ? 'Unavailable'
    : hasScheduledDowngrade
      ? 'Pending downgrade'
      : isCurrent
        ? isCurrentTrial
          ? 'Activate now'
          : 'Current plan'
        : plan.buttonLabel ?? 'View details';

  return (
    <View style={[styles.packageCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, (plan.highlighted || isCurrent) && { borderColor: colors.primary }]}>
      {plan.badge ? (
        <View style={styles.packageBadge}>
          <Text style={styles.packageBadgeText}>{plan.badge}</Text>
        </View>
      ) : null}
      <View style={styles.planHeader}>
        <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
        {isCurrent ? (
          <View style={[styles.statusPill, { backgroundColor: isCurrentTrial ? '#fffbeb' : '#dcfce7' }]}>
            <Text style={[styles.statusPillText, { color: isCurrentTrial ? '#b45309' : '#15803d' }]}>
              {isCurrentTrial ? 'Trial' : 'Current'}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{plan.description}</Text>
      <Text style={[styles.priceLine, { color: colors.primary }]}>
        {price}
        {!unavailable ? <Text style={[styles.priceSuffix, { color: colors.textSecondary }]}> {cycle === 'yearly' ? '/yr' : '/mo'}</Text> : null}
      </Text>
      <Pressable
        style={[styles.packageCta, { backgroundColor: colors.primary }, disabled && { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}
        disabled={disabled}
        onPress={onPress}
      >
        <Text style={[styles.packageCtaText, disabled && { color: colors.textSecondary }]}>{cta}</Text>
      </Pressable>
      <View style={styles.featureList}>
        {features.map((feature, featureIndex) => (
          <View
            key={`${plan.id || plan.key}-${feature.key || feature.label || 'feature'}-${featureIndex}`}
            style={styles.featureItem}
          >
            <Check color={colors.primary} size={14} />
            <Text style={[styles.featureLine, { color: colors.textSecondary }]}>{formatFeatureLabel(feature, cycle)}</Text>
          </View>
        ))}
      </View>
      {!hasScheduledDowngrade && !unavailable ? (
        <Pressable onPress={onPress} style={styles.viewDetailsLink}>
          <Text style={[styles.viewDetailsText, { color: colors.primary }]}>View plan details</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InvoiceRow({ invoice }: { invoice: WorkspaceInvoice }) {
  const { colors } = useTheme();
  const tone = statusTone(String(invoice.status));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.planName, { color: colors.text }]}>{formatCents(invoice.amountCents, invoice.currency)}</Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.text }]}>{String(invoice.status)}</Text>
        </View>
      </View>
      <Text style={[styles.muted, { color: colors.textSecondary }]}>{formatBillingDate(invoice.paidAt ?? invoice.createdAt)}</Text>
      {(invoice.periodStart || invoice.periodEnd) ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>
          {formatBillingDate(invoice.periodStart)} – {formatBillingDate(invoice.periodEnd)}
        </Text>
      ) : null}
    </View>
  );
}

function HistoryRow({ item }: { item: SubscriptionView }) {
  const { colors } = useTheme();
  const tone = statusTone(String(item.status));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.planName, { color: colors.text }]}>{item.planKey}</Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.text }]}>{String(item.status)}</Text>
        </View>
      </View>
      <Text style={[styles.muted, { color: colors.textSecondary }]}>{String(item.billingCycle).toLowerCase()}</Text>
      <Text style={[styles.muted, { color: colors.textSecondary }]}>
        {formatBillingDate(item.currentPeriodStart)} – {formatBillingDate(item.currentPeriodEnd)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  tabs: { backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  tab: { backgroundColor: '#f1f5f9', borderRadius: 999, flex: 1, paddingHorizontal: 8, paddingVertical: 8 },
  tabActive: { backgroundColor: '#dbeafe' },
  tabText: { color: '#64748b', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  tabTextActive: { color: '#1d4ed8', fontWeight: '700' },
  loader: { marginTop: 60 },
  content: { gap: 12, padding: 16 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 22, borderWidth: 1, padding: 16 },
  cardHighlight: { borderColor: '#2563eb' },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 },
  cardTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  cardBody: { color: '#64748b', fontSize: 13, marginTop: 8 },
  planHero: {
    backgroundColor: '#fff',
    borderColor: '#cfe1ff',
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
  },
  planHeroExpired: {
    backgroundColor: '#fff7f8',
    borderColor: '#fecdd3',
  },
  planHeroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  planHeroIcon: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  planHeroEyebrow: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  planHeroName: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  planHeroSubtitle: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 6,
  },
  priceChip: {
    alignItems: 'flex-end',
    backgroundColor: '#f8fbff',
    borderColor: '#dbeafe',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  priceChipValue: { color: '#2563eb', fontSize: 22, fontWeight: '800' },
  priceChipSuffix: { color: '#64748b', fontSize: 13, fontWeight: '600', paddingBottom: 3 },
  priceChipCycle: { color: '#94a3b8', fontSize: 12, fontWeight: '600', paddingBottom: 3 },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  metaText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  warnBanner: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 12,
  },
  warnBannerText: { color: '#92400e', flex: 1, fontSize: 12, lineHeight: 17 },
  dangerBanner: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 12,
  },
  dangerBannerText: { color: '#9f1239', flex: 1, fontSize: 12, lineHeight: 17 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 999,
    marginTop: 16,
    paddingVertical: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  packagesIntro: { alignItems: 'center', marginBottom: 4, paddingHorizontal: 8 },
  packagesTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  packagesSubtitle: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  cycleToggle: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#cfe1ff',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 16,
    padding: 4,
  },
  cycleOption: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  cycleOptionActive: { backgroundColor: '#2563eb' },
  cycleOptionText: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  cycleOptionTextActive: { color: '#fff' },
  saveBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    marginRight: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  saveBadgeText: { color: '#15803d', fontSize: 11, fontWeight: '800' },
  packageCard: {
    backgroundColor: '#fff',
    borderColor: '#d8e6fb',
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  packageBadge: {
    alignSelf: 'center',
    backgroundColor: '#4C84FF',
    borderRadius: 999,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  packageBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  priceSuffix: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  packageCta: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 999,
    marginTop: 14,
    paddingVertical: 12,
  },
  packageCtaDisabled: {
    backgroundColor: '#fff',
    borderColor: '#d8e6ff',
    borderWidth: 1,
  },
  packageCtaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  packageCtaTextDisabled: { color: '#64748b' },
  featureList: { marginTop: 14 },
  featureItem: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 8 },
  viewDetailsLink: { alignItems: 'center', marginTop: 14 },
  viewDetailsText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  usageCardExpired: {
    backgroundColor: '#fffdf7',
    borderColor: '#fde68a',
  },
  usageTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  usageCard: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  planName: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  priceLine: { color: '#2563eb', fontSize: 16, fontWeight: '800', marginTop: 6 },
  muted: { color: '#64748b', fontSize: 12, marginTop: 4 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  usageLabel: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  usageValue: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  usageTrack: { backgroundColor: '#e2e8f0', borderRadius: 999, height: 8, marginTop: 8, overflow: 'hidden' },
  usageFill: { backgroundColor: '#2563eb', height: 8 },
  usageHintWarn: { color: '#d97706', fontSize: 11, fontWeight: '600', marginTop: 6 },
  usageHintDanger: { color: '#e11d48', fontSize: 11, fontWeight: '600', marginTop: 6 },
  planHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  currentBadge: { backgroundColor: '#dbeafe', borderRadius: 999, color: '#1d4ed8', fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  featureLine: { color: '#475569', fontSize: 13, marginTop: 6 },
  emptyCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, padding: 28 },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyBody: { color: '#64748b', fontSize: 13, marginTop: 4, textAlign: 'center' },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
});
