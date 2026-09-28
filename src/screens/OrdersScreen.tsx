import { useQuery } from '@tanstack/react-query';
import { Search, ShoppingBag } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listOrders, type OrderStatus, type OrderSummary } from '../api/products';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton } from '../components/Skeleton';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppBadge, AppCard, ScreenHeader } from '../ui';

const STATUSES: Array<OrderStatus | 'ALL'> = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED', 'ALL'];

function formatTotal(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BDT' }).format(value / 100);
}

function OrderCard({ order }: { order: OrderSummary }) {
  const { colors } = useTheme();
  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><ShoppingBag color={colors.primary} size={18} /></View>
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{order.recipient.name || order.recipient.phone}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{order.source} · {new Date(order.date).toLocaleDateString()}</Text>
        </View>
        <AppBadge size="sm" tone={order.status === 'DELIVERED' ? 'success' : order.status === 'CANCELLED' ? 'danger' : 'warning'} label={order.status} />
      </View>
      <View style={styles.summary}>
        <Text style={[styles.total, { color: colors.text }]}>{formatTotal(order.total)}</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>{order.items.length} item{order.items.length === 1 ? '' : 's'} · {order.recipient.payment || 'Payment pending'}</Text>
      </View>
      <Text style={[styles.address, { color: colors.textMuted }]} numberOfLines={2}>{order.recipient.address || order.recipient.phone}</Text>
    </AppCard>
  );
}

export function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('PENDING');
  const ordersQuery = useQuery({
    queryKey: ['orders', search, status],
    queryFn: () => listOrders({ search: search.trim() || undefined, status: status === 'ALL' ? undefined : status, page: 1, limit: 25 }),
  });
  const orders = useMemo(() => ordersQuery.data?.items ?? [], [ordersQuery.data]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Orders" subtitle="Track customer orders" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Search color={colors.textMuted} size={17} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search orders or customers" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUSES.map((item) => <Pressable key={item} onPress={() => setStatus(item)} style={[styles.filter, { backgroundColor: status === item ? colors.primary : colors.surfaceSecondary }]}><Text style={[styles.filterText, { color: status === item ? colors.primaryText : colors.textSecondary }]}>{item}</Text></Pressable>)}
        </ScrollView>
        {ordersQuery.isLoading ? <FormSkeleton fields={5} /> : ordersQuery.isError ? <ErrorState message="Could not load orders." onRetry={() => ordersQuery.refetch()} /> : orders.length ? orders.map((order) => <OrderCard key={order.id} order={order} />) : <AppCard><Text style={[styles.empty, { color: colors.textMuted }]}>No orders found.</Text></AppCard>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { gap: spacing.md, padding: spacing.lg },
  search: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  input: { flex: 1, fontSize: fontSize.body, height: 48 }, filters: { gap: spacing.sm },
  filter: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, filterText: { fontSize: fontSize.small, fontWeight: fontWeight.bold },
  card: { gap: spacing.md }, header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, icon: { alignItems: 'center', borderRadius: radius.md, height: 38, justifyContent: 'center', width: 38 }, copy: { flex: 1, minWidth: 0 }, name: { fontSize: fontSize.body, fontWeight: fontWeight.bold }, meta: { fontSize: fontSize.small, marginTop: 2 }, summary: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, total: { fontSize: fontSize.body, fontWeight: fontWeight.bold }, address: { fontSize: fontSize.small }, empty: { fontSize: fontSize.body, textAlign: 'center' },
});
