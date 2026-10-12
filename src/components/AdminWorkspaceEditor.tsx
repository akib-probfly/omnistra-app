import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminQueryKeys, fetchAdminPlans, updateAdminWorkspaceSubscription, type AdminWorkspaceDetail } from '../api/admin';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/tokens';
import { AppButton, AppChip, AppText, AppTextField } from '../ui';
import { BottomSheet, SheetScrollView } from './BottomSheet';

export function AdminWorkspaceEditor({ workspace, onClose }: { workspace: AdminWorkspaceDetail; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [planKey, setPlanKey] = useState(workspace.currentSubscription?.planKey ?? workspace.billingPlanKey ?? '');
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>(workspace.currentSubscription?.billingCycle?.toUpperCase() === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
  const [expiry, setExpiry] = useState(() => {
    const value = workspace.currentSubscription?.currentPeriodEnd ?? workspace.billingCurrentPeriodEnd ?? workspace.billingTrialEndsAt ?? workspace.expiresAt;
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [validation, setValidation] = useState('');
  const plans = useQuery({ queryKey: adminQueryKeys.plans, queryFn: fetchAdminPlans });
  const plan = plans.data?.items.find((item) => item.key === planKey);
  const supported = (value: 'MONTHLY' | 'YEARLY') => !plan?.intervals || Boolean(plan.intervals[value === 'YEARLY' ? 'yearly' : 'monthly']);
  const resolvedCycle = supported(cycle) ? cycle : supported('MONTHLY') ? 'MONTHLY' : 'YEARLY';
  const mutation = useMutation({ mutationFn: updateAdminWorkspaceSubscription, onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
      ...['billing-subscription-current', 'billing-subscription-history', 'billing-usage'].map((key) => queryClient.invalidateQueries({ queryKey: [key, workspace.id] })),
    ]);
    onClose();
  } });
  const save = () => {
    if (!plan || !supported(resolvedCycle)) { setValidation('Select a package and supported billing cycle.'); return; }
    let expiresAt: string | null = null;
    if (expiry.trim()) {
      const value = expiry.trim();
      const date = new Date(`${value}T12:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) { setValidation('Enter a valid date as YYYY-MM-DD.'); return; }
      expiresAt = date.toISOString();
    }
    setValidation('');
    mutation.mutate({ workspaceId: workspace.id, planKey, billingCycle: resolvedCycle, expiresAt });
  };
  return <BottomSheet visible onClose={() => { if (!mutation.isPending) onClose(); }} sheetStyle={{ backgroundColor: colors.surface, maxHeight: '90%' }}>
    <View style={styles.header}><AppText variant="heading">Edit plan & expiry</AppText><AppButton label="Close" variant="ghost" disabled={mutation.isPending} onPress={onClose} /></View>
    <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AppText tone="secondary">{workspace.name}</AppText>
      {plans.isPending ? <ActivityIndicator color={colors.primary} /> : plans.error ? <><AppText tone="error">{plans.error.message}</AppText><AppButton label="Retry" onPress={() => { void plans.refetch(); }} /></> : <>
        <AppText variant="bodyStrong">Package</AppText>
        <View style={styles.row}>{plans.data?.items.map((item) => <AppChip key={item.key} label={item.name} selected={item.key === planKey} onPress={() => { if (!mutation.isPending) setPlanKey(item.key); }} />)}</View>
        <AppText variant="bodyStrong">Billing cycle</AppText>
        <View style={styles.row}>{(['MONTHLY', 'YEARLY'] as const).map((value) => <AppButton key={value} label={value === 'MONTHLY' ? 'Monthly' : 'Yearly'} variant={resolvedCycle === value ? 'primary' : 'secondary'} disabled={!supported(value) || mutation.isPending} onPress={() => setCycle(value)} />)}</View>
        <AppTextField label="Expiry date" value={expiry} onChangeText={setExpiry} placeholder="2026-10-10" helpText="YYYY-MM-DD. Leave empty to use the plan’s billing period." autoCapitalize="none" editable={!mutation.isPending} />
      </>}
      {validation || mutation.error ? <AppText tone="error">{validation || mutation.error?.message}</AppText> : null}
    </SheetScrollView>
    <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}><AppButton label="Save changes" block loading={mutation.isPending} disabled={!plans.data || Boolean(plans.error)} onPress={save} /></View>
  </BottomSheet>;
}
const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  content: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
