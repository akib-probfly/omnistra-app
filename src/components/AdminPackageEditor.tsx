import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminQueryKeys, updateAdminPackage, type AdminPackageUpdate } from '../api/admin';
import type { BillingInterval, BillingPlan, BillingPlanInterval } from '../api/billing';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/tokens';
import { AppButton, AppChip, AppText, AppTextField } from '../ui';
import { BottomSheet, SheetScrollView } from './BottomSheet';

type IntervalForm = { price: string; memberLimit: string; conversationLimit: string; channelLimit: string; features: BillingPlanInterval['features'] };
const limitFields = [{ key: 'memberLimit', label: 'Member limit' }, { key: 'conversationLimit', label: 'Conversation limit' }, { key: 'channelLimit', label: 'Channel limit' }] as const;
export function AdminPackageEditor({ plan, onClose }: { plan: BillingPlan; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description);
  const [active, setActive] = useState(plan.isActive !== false);
  const [popular, setPopular] = useState(Boolean(plan.highlighted));
  const [intervals, setIntervals] = useState<Partial<Record<BillingInterval, IntervalForm>>>(() => {
    const result: Partial<Record<BillingInterval, IntervalForm>> = {};
    for (const key of ['monthly', 'yearly'] as const) {
      const interval = plan.intervals?.[key];
      if (plan.intervals && !interval) continue;
      const price = interval?.priceCents ?? (key === 'monthly' ? plan.monthlyPriceCents : plan.yearlyPriceCents);
      result[key] = { price: (price / 100).toFixed(2), memberLimit: interval?.memberLimit == null ? '' : String(interval.memberLimit), conversationLimit: interval?.conversationLimit == null ? '' : String(interval.conversationLimit), channelLimit: interval?.channelLimit == null ? '' : String(interval.channelLimit), features: (interval?.features ?? plan.features).map((feature) => ({ ...feature })) };
    }
    return result;
  });
  const [tab, setTab] = useState<BillingInterval>(plan.intervals && !plan.intervals.monthly ? 'yearly' : 'monthly');
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: (input: AdminPackageUpdate) => updateAdminPackage(plan.key, input), onSuccess: async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: adminQueryKeys.all }), queryClient.invalidateQueries({ queryKey: ['billing-plans'] })]);
    onClose();
  } });
  const update = (change: Partial<IntervalForm>) => setIntervals((current) => ({ ...current, [tab]: { ...current[tab]!, ...change } }));
  const save = () => {
    if (!name.trim() || !description.trim()) { setError('Name and description are required.'); return; }
    const payload: Partial<Record<BillingInterval, BillingPlanInterval>> = {};
    for (const key of ['monthly', 'yearly'] as const) {
      const value = intervals[key];
      if (!value) continue;
      if (!/^\d+(\.\d{1,2})?$/.test(value.price.trim())) { setError(`${key} price must be a non-negative amount with up to two decimal places.`); return; }
      const [whole, fraction = ''] = value.price.trim().split('.');
      const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
      if (!Number.isSafeInteger(cents)) { setError('Price is too large.'); return; }
      const limits: Partial<Pick<BillingPlanInterval, 'memberLimit' | 'conversationLimit' | 'channelLimit'>> = {};
      for (const field of limitFields) {
        const text = value[field.key].trim();
        if (text && (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1)) { setError(`${key} ${field.label.toLowerCase()} must be a positive whole number, or blank for unlimited.`); return; }
        limits[field.key] = text ? Number(text) : null;
      }
      if (value.features.some((feature) => !feature.label.trim())) { setError('Feature labels cannot be empty.'); return; }
      const currency = plan.currency || 'USD';
      const price = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
      payload[key] = { ...plan.intervals?.[key], price, priceCents: cents, ...limits, features: value.features.map((feature) => ({ ...feature, label: feature.label.trim(), kind: feature.kind ?? 'feature_flag', status: feature.status ?? 'default' })) };
    }
    setError('');
    mutation.mutate({ name: name.trim(), description: description.trim(), isActive: active, highlighted: popular, badge: popular ? plan.badge || 'Popular' : null, intervals: payload });
  };
  const current = intervals[tab];
  return <BottomSheet visible onClose={() => { if (!mutation.isPending) onClose(); }} sheetStyle={{ backgroundColor: colors.surface, maxHeight: '92%' }}>
    <View style={styles.header}><AppText variant="heading">Edit package</AppText><AppButton label="Close" variant="ghost" disabled={mutation.isPending} onPress={onClose} /></View>
    <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AppText variant="small" tone="secondary">Package key · {plan.key}</AppText>
      <AppTextField label="Name" value={name} onChangeText={setName} editable={!mutation.isPending} />
      <AppTextField label="Description" value={description} onChangeText={setDescription} multiline editable={!mutation.isPending} />
      <View style={styles.header}><AppText>Active</AppText><Switch accessibilityLabel="Package active" value={active} onValueChange={setActive} disabled={mutation.isPending} trackColor={{ true: colors.primary }} /></View>
      <View style={styles.header}><AppText>Mark as popular</AppText><Switch accessibilityLabel="Package popular" value={popular} onValueChange={setPopular} disabled={mutation.isPending} trackColor={{ true: colors.primary }} /></View>
      <View style={styles.row}>{(['monthly', 'yearly'] as const).filter((key) => intervals[key]).map((key) => <AppChip key={key} label={key === 'monthly' ? 'Monthly' : 'Yearly'} selected={tab === key} onPress={() => setTab(key)} />)}</View>
      {current ? <>
        <AppTextField label={`Price (${plan.currency})`} value={current.price} keyboardType="decimal-pad" onChangeText={(price) => update({ price })} editable={!mutation.isPending} />
        {limitFields.map((field) => <AppTextField key={field.key} label={field.label} value={current[field.key]} keyboardType="number-pad" placeholder="Unlimited" helpText="Leave blank for unlimited." onChangeText={(text) => update({ [field.key]: text })} editable={!mutation.isPending} />)}
        <AppText variant="bodyStrong">Features</AppText>
        {current.features.map((feature, index) => <View key={`${tab}:${index}`} style={styles.feature}>
          <AppTextField label={`Feature ${index + 1}`} value={feature.label} onChangeText={(label) => update({ features: current.features.map((item, i) => i === index ? { ...item, label } : item) })} editable={!mutation.isPending} />
          <AppTextField label="Information" value={feature.info ?? ''} onChangeText={(info) => update({ features: current.features.map((item, i) => i === index ? { ...item, info: info || null } : item) })} editable={!mutation.isPending} />
          <View style={styles.header}><AppText variant="caption">Coming soon</AppText><Switch value={feature.status === 'coming-soon'} onValueChange={(comingSoon) => update({ features: current.features.map((item, i) => i === index ? { ...item, status: comingSoon ? 'coming-soon' : 'default' } : item) })} disabled={mutation.isPending} trackColor={{ true: colors.primary }} /></View>
        </View>)}
      </> : null}
      {error || mutation.error ? <AppText tone="error">{error || mutation.error?.message}</AppText> : null}
    </SheetScrollView>
    <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}><AppButton label="Save package" block loading={mutation.isPending} onPress={save} /></View>
  </BottomSheet>;
}
const styles = StyleSheet.create({ content: { padding: spacing.lg, gap: spacing.md }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg }, row: { flexDirection: 'row', gap: spacing.sm }, feature: { gap: spacing.sm } });
