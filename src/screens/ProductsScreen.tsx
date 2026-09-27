import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteProduct, listProducts, updateProductStatus, type ProductResponse } from '../api/products';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton } from '../components/Skeleton';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppCard, ScreenHeader } from '../ui';

const STATUS_FILTERS = ['ALL', 'DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;

function formatPrice(product: ProductResponse) {
  const minor = product.salePriceMinor ?? product.priceMinor;
  if (minor === null) return 'Price not set';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: product.currency ?? 'USD' }).format(minor / 100);
  } catch {
    return `${product.currency ?? ''} ${(minor / 100).toFixed(2)}`.trim();
  }
}

function ProductRow({ product, onToggle, onDelete, onEdit }: { product: ProductResponse; onToggle: () => void; onDelete: () => void; onEdit: () => void }) {
  const { colors } = useTheme();
  const active = product.status === 'ACTIVE';
  return (
    <AppCard style={styles.productCard}>
      <View style={styles.productHeader}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Package color={colors.primary} size={20} /></View>
        <View style={styles.productCopy}>
          <Text style={[styles.productName, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
          <Text style={[styles.productMeta, { color: colors.textSecondary }]} numberOfLines={1}>{product.sku || product.category || 'No SKU or category'}</Text>
        </View>
        <AppBadge size="sm" tone={active ? 'success' : product.status === 'ARCHIVED' ? 'neutral' : 'warning'} label={product.status} />
      </View>
      <View style={styles.productDetails}>
        <Text style={[styles.price, { color: colors.text }]}>{formatPrice(product)}</Text>
        <Text style={[styles.inventory, { color: colors.textSecondary }]}>Stock: {product.inventory ?? 'Not set'}</Text>
      </View>
      <View style={styles.actions}>
        <AppButton label="Edit" variant="secondary" onPress={onEdit} />
        <AppButton label={active ? 'Deactivate' : 'Activate'} variant="secondary" onPress={onToggle} />
        <AppButton label="Delete" variant="destructive" onPress={onDelete} />
      </View>
    </AppCard>
  );
}

export function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const productsQuery = useQuery({
    queryKey: ['products', search, status],
    queryFn: () => listProducts({ search: search.trim() || undefined, status: status === 'ALL' ? undefined : status, page: 1, limit: 50 }),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['products'] });
  const statusMutation = useMutation({
    mutationFn: ({ product, next }: { product: ProductResponse; next: boolean }) => updateProductStatus(product.id, next, product.salesChannels.filter((item) => item.catalogId).map((item) => item.channelId)),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({ mutationFn: deleteProduct, onSuccess: invalidate });
  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Products" subtitle="Manage your product catalog" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <AppButton block icon={Plus} label="Create product" onPress={() => navigation.navigate('ProductForm', undefined)} />
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Search color={colors.textMuted} size={17} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search products" placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.text }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_FILTERS.map((item) => (
            <Pressable key={item} onPress={() => setStatus(item)} style={[styles.filter, { backgroundColor: status === item ? colors.primary : colors.surfaceSecondary }]}>
              <Text style={[styles.filterText, { color: status === item ? colors.primaryText : colors.textSecondary }]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {productsQuery.isLoading ? <FormSkeleton fields={5} /> : productsQuery.isError ? <ErrorState message="Could not load products." onRetry={() => productsQuery.refetch()} /> : products.length ? products.map((product) => (
          <ProductRow key={product.id} product={product} onEdit={() => navigation.navigate('ProductForm', { productId: product.id })} onToggle={() => statusMutation.mutate({ product, next: product.status !== 'ACTIVE' })} onDelete={() => deleteMutation.mutate(product.id)} />
        )) : <AppCard><Text style={[styles.empty, { color: colors.textMuted }]}>No products found.</Text></AppCard>}
        {statusMutation.isPending || deleteMutation.isPending ? <ActivityIndicator color={colors.primary} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg },
  search: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontSize: fontSize.body, height: 48 },
  filters: { gap: spacing.sm },
  filter: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterText: { fontSize: fontSize.small, fontWeight: fontWeight.bold },
  productCard: { gap: spacing.md },
  productHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  icon: { alignItems: 'center', borderRadius: radius.md, height: 40, justifyContent: 'center', width: 40 },
  productCopy: { flex: 1, minWidth: 0 },
  productName: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold },
  productMeta: { fontSize: fontSize.small, marginTop: 2 },
  productDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  price: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  inventory: { fontSize: fontSize.small },
  actions: { flexDirection: 'row', gap: spacing.sm },
  empty: { fontSize: fontSize.body, textAlign: 'center' },
});
