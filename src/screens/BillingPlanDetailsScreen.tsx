import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, LoaderCircle } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
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
import {
  calculateProration,
  changePlan,
  createPipraPayCheckoutSession,
  fetchBillingPlans,
  fetchCurrentSubscription,
  formatCents,
  formatFeatureLabel,
  getPlanFeatures,
  getPlanInterval,
  getPlanPrice,
  getPlanPriceCents,
  normalizeBillingCycle,
  type BillingInterval,
} from '../api/billing';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton } from '../components/Skeleton';
import type { SettingsStackParamList } from '../navigation/SettingsStack';

function isLiveSubscriptionStatus(status?: string | null) {
  const value = (status ?? '').toLowerCase();
  return value === 'active' || value === 'changing' || value === 'trialing';
}

async function openCheckout(url: string) {
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error('Unable to open the payment page on this device.');
  await Linking.openURL(url);
}

export function BillingPlanDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const { colors } = useTheme();
  const route = useRoute<RouteProp<SettingsStackParamList, 'BillingPlanDetails'>>();
  const queryClient = useQueryClient();
  const { planKey, workspaceId, cycle: initialCycle } = route.params;
  const [billingCycle, setBillingCycle] = useState<BillingInterval>(normalizeBillingCycle(initialCycle));
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const plansQuery = useQuery({
    queryKey: ['billing-plans'],
    queryFn: fetchBillingPlans,
    staleTime: 5 * 60_000,
  });
  const subscriptionQuery = useQuery({
    queryKey: ['billing-subscription-current', workspaceId],
    queryFn: () => fetchCurrentSubscription(workspaceId),
    staleTime: 60_000,
  });

  const plans = plansQuery.data?.items ?? [];
  const plan = plans.find((item) => item.key === planKey) ?? null;
  const selectedInterval = plan ? getPlanInterval(plan, billingCycle) : null;
  const selectedIntervalUnavailable = Boolean(plan?.intervals) && !selectedInterval;

  useEffect(() => {
    if (!plan?.intervals || selectedInterval) return;
    const nextCycle = getPlanInterval(plan, 'monthly')
      ? 'monthly'
      : getPlanInterval(plan, 'yearly')
        ? 'yearly'
        : billingCycle;
    if (nextCycle !== billingCycle) setBillingCycle(nextCycle);
  }, [billingCycle, plan, selectedInterval]);

  const subscription = subscriptionQuery.data?.subscription ?? null;
  const billingState = subscriptionQuery.data?.billingState ?? null;
  const hasLiveSubscription = isLiveSubscriptionStatus(subscription?.status);
  const hasLiveBillingState = isLiveSubscriptionStatus(billingState?.subscriptionStatus);
  const resolvedPlanKey = hasLiveSubscription
    ? subscription?.planKey ?? billingState?.planKey ?? null
    : hasLiveBillingState
      ? billingState?.planKey ?? subscription?.planKey ?? null
      : subscription?.planKey ?? billingState?.planKey ?? null;
  const resolvedBillingCycle = normalizeBillingCycle(
    hasLiveSubscription
      ? subscription?.billingCycle ?? billingState?.billingCycle ?? billingCycle
      : hasLiveBillingState
        ? billingState?.billingCycle ?? subscription?.billingCycle ?? billingCycle
        : subscription?.billingCycle ?? billingState?.billingCycle ?? billingCycle,
  );
  const resolvedStatus = (
    hasLiveSubscription
      ? subscription?.status
      : hasLiveBillingState
        ? billingState?.subscriptionStatus
        : subscription?.status ?? billingState?.subscriptionStatus
  ) ?? null;
  const isInTrialPeriod = (
    (resolvedStatus ?? '').toLowerCase() === 'trialing'
    || (subscription?.isTrial === true && Boolean(billingState?.trialEndsAt))
  );
  const currentPlan = resolvedPlanKey ? plans.find((item) => item.key === resolvedPlanKey) ?? null : null;
  const isCurrentPlan = resolvedPlanKey === planKey;
  const isCurrentTrialPlan = isCurrentPlan && isInTrialPeriod;
  const isDowngrade = Boolean(
    resolvedPlanKey
    && (resolvedStatus ?? '').toLowerCase() === 'active'
    && resolvedPlanKey !== planKey
    && plan
    && currentPlan
    && getPlanPriceCents(plan, resolvedBillingCycle) != null
    && getPlanPriceCents(currentPlan, resolvedBillingCycle) != null
    && (getPlanPriceCents(plan, resolvedBillingCycle) ?? 0) < (getPlanPriceCents(currentPlan, resolvedBillingCycle) ?? 0),
  );
  const upgradeMode = Boolean(
    resolvedPlanKey
    && (resolvedStatus ?? '').toLowerCase() === 'active'
    && resolvedPlanKey !== planKey
    && !isDowngrade,
  );
  const effectiveCycle = upgradeMode ? resolvedBillingCycle : billingCycle;
  const effectiveIntervalUnavailable = Boolean(plan?.intervals) && !getPlanInterval(plan, effectiveCycle);
  const effectivePrice = effectiveIntervalUnavailable ? 'Unavailable' : getPlanPrice(plan, effectiveCycle) ?? '—';
  const price = selectedIntervalUnavailable ? 'Unavailable' : getPlanPrice(plan, billingCycle) ?? '—';
  const pendingChangePlanKey = subscription?.pendingChangePlanKey ?? billingState?.pendingChangePlanKey ?? null;
  const hasScheduledDowngrade = Boolean(pendingChangePlanKey);
  const pendingPlanName = plans.find((item) => item.key === pendingChangePlanKey)?.name ?? pendingChangePlanKey;
  const features = useMemo(() => getPlanFeatures(plan, billingCycle), [plan, billingCycle]);

  const prorationQuery = useQuery({
    queryKey: ['billing-proration', workspaceId, planKey],
    queryFn: () => calculateProration(workspaceId, planKey),
    enabled: Boolean(workspaceId && planKey && upgradeMode && !effectiveIntervalUnavailable),
    staleTime: 30_000,
  });
  const proration = prorationQuery.data?.proration ?? null;

  const invalidateBilling = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['billing-subscription-current', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['billing-usage', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['billing-invoices', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['billing-subscription-history', workspaceId] }),
    ]);
  };

  const changePlanMutation = useMutation({
    mutationFn: (input: { immediate: boolean; successUrl: string; cancelUrl: string }) => changePlan({
      workspaceId,
      newPlanKey: planKey,
      immediate: input.immediate,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    }),
  });

  const buildReturnUrls = (cycle: BillingInterval) => {
    const successParams = new URLSearchParams({ planKey, cycle, workspaceId });
    const cancelParams = new URLSearchParams({ planKey, cycle });
    return {
      successUrl: `osaas://billing/success?${successParams.toString()}`,
      cancelUrl: `osaas://billing/cancel?${cancelParams.toString()}`,
    };
  };

  const handlePrimaryAction = async () => {
    if (!plan) return;
    setIsStartingCheckout(true);
    try {
      if (effectiveIntervalUnavailable || selectedIntervalUnavailable) {
        Alert.alert('Billing cycle unavailable', 'This package is not available for the selected cycle.');
        return;
      }
      if (hasScheduledDowngrade) {
        Alert.alert('Plan change locked', 'A downgrade is already scheduled. Wait until it becomes active.');
        return;
      }
      if (isCurrentPlan && !isCurrentTrialPlan) {
        Alert.alert('Already on this plan', 'This is your current subscription.');
        return;
      }

      if (upgradeMode) {
        const urls = buildReturnUrls(effectiveCycle);
        const data = await changePlanMutation.mutateAsync({ immediate: true, ...urls });
        if (data.requiresPayment && data.checkoutUrl) {
          Toast.show({ type: 'success', text1: 'Redirecting to payment', text2: 'Opening secure PipraPay checkout.' });
          await openCheckout(data.checkoutUrl);
          return;
        }
        await invalidateBilling();
        Toast.show({ type: 'success', text1: 'Plan updated', text2: 'Your workspace subscription was upgraded.' });
        navigation.navigate('Billing', { tab: 'current' });
        return;
      }

      if (isDowngrade) {
        const urls = buildReturnUrls(resolvedBillingCycle);
        const data = await changePlanMutation.mutateAsync({ immediate: false, ...urls });
        if (data.requiresPayment && data.checkoutUrl) {
          Toast.show({ type: 'success', text1: 'Redirecting to payment', text2: 'Opening secure PipraPay checkout.' });
          await openCheckout(data.checkoutUrl);
          return;
        }
        await invalidateBilling();
        Toast.show({
          type: 'success',
          text1: 'Downgrade scheduled',
          text2: `Your plan will switch to ${plan.name} at the end of this billing period.`,
        });
        navigation.navigate('Billing', { tab: 'current' });
        return;
      }

      const urls = buildReturnUrls(billingCycle);
      const response = await createPipraPayCheckoutSession({
        workspaceId,
        planKey: plan.key,
        billingCycle,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      });
      Toast.show({ type: 'success', text1: 'Redirecting to payment', text2: 'Opening secure PipraPay checkout.' });
      await openCheckout(response.checkoutUrl);
    } catch (error) {
      Alert.alert('Could not start payment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsStartingCheckout(false);
    }
  };

  const busy = isStartingCheckout || changePlanMutation.isPending;
  const ctaLabel = busy
    ? upgradeMode
      ? 'Processing upgrade...'
      : isDowngrade
        ? 'Starting downgrade checkout...'
        : 'Starting checkout...'
    : hasScheduledDowngrade
      ? 'Plan change locked'
      : effectiveIntervalUnavailable || selectedIntervalUnavailable
        ? 'Unavailable for this cycle'
        : isCurrentTrialPlan
          ? 'Activate now'
          : isCurrentPlan
            ? 'Already in plan'
            : upgradeMode
              ? `Upgrade to ${plan?.name ?? 'plan'}`
              : isDowngrade
                ? 'Downgrade with payment'
                : 'Continue to payment';

  if (plansQuery.isLoading || subscriptionQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }, styles.centered]}>
        <FormSkeleton fields={5} />
      </View>
    );
  }

  if (plansQuery.isError || !plan) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
            <ArrowLeft color={colors.text} size={22} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Plan details</Text>
        </View>
        <ErrorState
          message={plansQuery.error instanceof Error ? plansQuery.error.message : 'Unable to load this package.'}
          onRetry={() => plansQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <ArrowLeft color={colors.text} size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{plan.name}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {upgradeMode ? 'Upgrade' : isDowngrade ? 'Downgrade' : plan.badge ?? 'Subscription'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={styles.eyebrow}>{upgradeMode ? 'Upgrade' : plan.badge ?? 'Subscription'}</Text>
          <Text style={[styles.planTitle, { color: colors.text }]}>{plan.name}</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>{plan.description}</Text>

          <View style={[styles.priceBox, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
            <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>{effectiveCycle === 'monthly' ? 'Monthly' : 'Yearly'}</Text>
            <Text style={[styles.priceValue, { color: colors.text }]}>
              {effectivePrice}
              <Text style={[styles.priceSuffix, { color: colors.textSecondary }]}>{effectiveCycle === 'monthly' ? ' /mo' : ' /yr'}</Text>
            </Text>
          </View>

          {upgradeMode ? (
            <View style={styles.upgradeBanner}>
              <Text style={styles.upgradeTitle}>Upgrade mode</Text>
              <Text style={styles.upgradeBody}>
                Your current billing cycle stays {effectiveCycle}. The new plan will be prorated from the remaining value of your current subscription.
              </Text>
            </View>
          ) : (
            <View style={[styles.cycleToggle, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              {(['monthly', 'yearly'] as const).map((cycle) => {
                const active = billingCycle === cycle;
                const unavailable = Boolean(plan.intervals) && !getPlanInterval(plan, cycle);
                return (
                  <Pressable
                    key={cycle}
                    disabled={unavailable}
                    onPress={() => setBillingCycle(cycle)}
                    style={[styles.cycleOption, active && { backgroundColor: colors.primary }, unavailable && styles.cycleOptionDisabled]}
                  >
                    <Text style={[styles.cycleOptionText, { color: colors.textSecondary }, active && styles.cycleOptionTextActive]}>
                      {cycle === 'monthly' ? 'Pay monthly' : 'Pay yearly'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Included features</Text>
          {features.map((feature, index) => (
            <View key={`${feature.key || feature.label}-${index}`} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <BadgeCheck color={colors.primary} size={14} />
              </View>
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>{formatFeatureLabel(feature, billingCycle)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={styles.eyebrow}>Summary</Text>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {upgradeMode ? `Upgrade to ${plan.name}` : isDowngrade ? `Downgrade to ${plan.name}` : `Start ${plan.name}`}
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {hasScheduledDowngrade
              ? `You already have a scheduled downgrade to ${pendingPlanName}. Package changes are locked until that plan becomes active.`
              : upgradeMode
                ? `You are moving from ${currentPlan?.name ?? 'your current plan'} to ${plan.name}. Remaining value will be credited before the final charge.`
                : isDowngrade
                  ? `You are moving from ${currentPlan?.name ?? 'your current plan'} to ${plan.name}. Pay now; ${plan.name} starts at the end of this billing period.`
                  : 'Your subscription is attached to this workspace. When payment succeeds, the plan unlocks for the workspace.'}
          </Text>

          {upgradeMode && proration ? (
            <View style={styles.prorationBox}>
              <SummaryLine label="Current plan" value={`${currentPlan?.name ?? 'Current'} ${effectiveCycle}`} colors={colors} />
              <SummaryLine label="New plan price" value={`${effectivePrice}${effectiveCycle === 'monthly' ? '/mo' : '/yr'}`} colors={colors} />
              <SummaryLine label="Remaining credit" value={`-${formatCents(proration.creditCents)}`} valueTone="credit" colors={colors} />
              <View style={styles.prorationDivider} />
              <SummaryLine label="Amount due now" value={formatCents(proration.netAmountCents)} valueTone="emphasis" colors={colors} />
            </View>
          ) : (
            <View style={[styles.summaryBox, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
              <SummaryLine label="Cycle" value={billingCycle === 'monthly' ? 'Monthly' : 'Yearly'} colors={colors} />
              <SummaryLine label="Price" value={price} colors={colors} />
            </View>
          )}

          {upgradeMode && prorationQuery.isLoading ? (
            <View style={styles.prorationLoading}>
              <LoaderCircle color={colors.primary} size={16} />
              <Text style={[styles.prorationLoadingText, { color: colors.textSecondary }]}>Calculating proration...</Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.ctaButton,
              { backgroundColor: colors.primary },
              (busy || hasScheduledDowngrade || effectiveIntervalUnavailable || selectedIntervalUnavailable || (isCurrentPlan && !isCurrentTrialPlan)) && styles.ctaDisabled,
            ]}
            disabled={busy || hasScheduledDowngrade || effectiveIntervalUnavailable || selectedIntervalUnavailable || (isCurrentPlan && !isCurrentTrialPlan)}
            onPress={() => { void handlePrimaryAction(); }}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{ctaLabel}</Text>}
          </Pressable>
        </View>

        <View style={[styles.nextCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>What happens next</Text>
          {(upgradeMode
            ? [
                'We calculate the prorated amount based on your remaining subscription value.',
                'You complete payment for the prorated difference.',
                'Your plan is upgraded immediately and new features unlock.',
              ]
            : isDowngrade
              ? [
                  `We create a PipraPay checkout for the next ${plan.name} billing cycle.`,
                  'Your current plan stays active after payment until this period ends.',
                  `At period end, we activate your paid ${plan.name} subscription.`,
                ]
              : [
                  'We create a PipraPay checkout session for this workspace.',
                  'You complete payment on PipraPay’s secure checkout.',
                  'Payment is verified on the server and the subscription is written to the workspace.',
                ]
          ).map((step, index) => (
            <Text key={step} style={[styles.nextStep, { color: colors.textSecondary }]}>{index + 1}. {step}</Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryLine({
  label,
  value,
  valueTone,
  colors,
}: {
  label: string;
  value: string;
  valueTone?: 'credit' | 'emphasis';
  colors: { textSecondary: string; text: string };
}) {
  return (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          { color: colors.text },
          valueTone === 'credit' && styles.summaryCredit,
          valueTone === 'emphasis' && styles.summaryEmphasis,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  backButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  content: { gap: 12, padding: 16 },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  eyebrow: {
    color: '#4c84ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  planTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: 8 },
  description: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  priceBox: {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  priceLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  priceValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  priceSuffix: { fontSize: 14, fontWeight: '600' },
  upgradeBanner: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  upgradeTitle: { color: '#047857', fontSize: 13, fontWeight: '800' },
  upgradeBody: { color: '#065f46', fontSize: 12, lineHeight: 18, marginTop: 4 },
  cycleToggle: {
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 14,
    padding: 4,
  },
  cycleOption: { borderRadius: 999, flex: 1, paddingVertical: 10 },
  cycleOptionDisabled: { opacity: 0.4 },
  cycleOptionText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cycleOptionTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  featureRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, marginBottom: 10 },
  featureIcon: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  featureText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  summaryTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginTop: 6 },
  summaryBox: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  prorationBox: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  prorationDivider: { backgroundColor: '#a7f3d0', height: 1, marginVertical: 10 },
  summaryLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13, fontWeight: '700' },
  summaryCredit: { color: '#047857' },
  summaryEmphasis: { color: '#047857', fontSize: 18 },
  prorationLoading: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 12 },
  prorationLoadingText: { fontSize: 12, fontWeight: '600' },
  ctaButton: {
    alignItems: 'center',
    borderRadius: 999,
    marginTop: 16,
    paddingVertical: 13,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  nextCard: {
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 18,
  },
  nextStep: { fontSize: 13, lineHeight: 20, marginTop: 8 },
});
