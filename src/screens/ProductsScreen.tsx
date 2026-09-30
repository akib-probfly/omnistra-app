import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Check, Download, Import, Package, Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteProduct, deleteProducts, exportProducts, fetchProductExports, fetchProductImports, importProducts, listProducts, updateProductStatus, type ProductImportField, type ProductResponse } from '../api/products';
import { fetchChannels } from '../api/channels';
import { fetchProductCategories } from '../api/productCategories';
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

function ProductRow({ product, selected, onSelect, onToggle, onDelete, onEdit }: { product: ProductResponse; selected: boolean; onSelect: () => void; onToggle: () => void; onDelete: () => void; onEdit: () => void }) {
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
        <Pressable onPress={onSelect} style={[styles.selectButton, { backgroundColor: selected ? colors.primary : colors.surfaceSecondary }]} accessibilityLabel={selected ? 'Deselect product' : 'Select product'}>{selected ? <Check color={colors.primaryText} size={15} /> : null}</Pressable>
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
  const [availability, setAvailability] = useState<'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [category, setCategory] = useState('ALL');
  const [localOnly, setLocalOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [salesChannelIds, setSalesChannelIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: () => fetchProductCategories() });
  const channelsQuery = useQuery({ queryKey: ['channels'], queryFn: fetchChannels });
  const productsQuery = useQuery({
    queryKey: ['products', search, status, availability, category, localOnly, salesChannelIds, page],
    queryFn: () => listProducts({ search: search.trim() || undefined, status: status === 'ALL' ? undefined : status, availability: availability === 'ALL' ? undefined : availability, category: category === 'ALL' ? undefined : category, localOnly, salesChannelIds, page, limit: 25 }),
  });
  const importsQuery = useQuery({ queryKey: ['products', 'imports'], queryFn: fetchProductImports, refetchInterval: (query) => query.state.data?.items.some((job) => job.status === 'PENDING' || job.status === 'PROCESSING') ? 2500 : false });
  const exportsQuery = useQuery({ queryKey: ['products', 'exports'], queryFn: fetchProductExports, refetchInterval: (query) => query.state.data?.items.some((job) => job.status === 'PENDING' || job.status === 'PROCESSING') ? 2500 : false });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['products'] });
  const statusMutation = useMutation({
    mutationFn: ({ product, next }: { product: ProductResponse; next: boolean }) => updateProductStatus(product.id, next, product.salesChannels.filter((item) => item.catalogId).map((item) => item.channelId)),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({ mutationFn: deleteProduct, onSuccess: invalidate });
  const bulkDeleteMutation = useMutation({ mutationFn: deleteProducts, onSuccess: async (result) => { setSelectedIds([]); await invalidate(); Alert.alert('Products removed', `${result.deleted} deleted · ${result.archived} archived.`); }, onError: (error: Error) => Alert.alert('Could not remove products', error.message) });
  const exportMutation = useMutation({ mutationFn: exportProducts, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['products', 'exports'] }); Alert.alert('Export started', 'The product CSV will be prepared and delivered through notifications when ready.'); }, onError: (error: Error) => Alert.alert('Export failed', error.message) });
  const importMutation = useMutation({ mutationFn: importProducts, onSuccess: async (job) => { await queryClient.invalidateQueries({ queryKey: ['products', 'imports'] }); Alert.alert('Import started', `${job.fileName} is being processed. You can continue using the app.`); }, onError: (error: Error) => Alert.alert('Import failed', error.message) });
  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data]);

  const importCsv = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!asset.name.toLowerCase().endsWith('.csv')) { Alert.alert('Choose a CSV file', 'Product imports accept CSV files.'); return; }
      const csvText = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const headers = (csvText.split(/\r?\n/, 1)[0] ?? '').replace(/^\uFEFF/, '').split(',').map((item) => item.trim().replace(/^"|"$/g, ''));
      const aliases: Partial<Record<ProductImportField, string[]>> = { name: ['name', 'product name', 'title'], sku: ['sku', 'product sku'], category: ['category', 'product category'], description: ['description'], shortDescription: ['short description'], currency: ['currency'], basePrice: ['price', 'base price'], salePrice: ['sale price'], weight: ['weight'], dimensionL: ['length', 'length cm'], dimensionW: ['width', 'width cm'], dimensionH: ['height', 'height cm'], initialStock: ['stock', 'inventory', 'initial stock'], stockAlert: ['stock alert'], isActive: ['active', 'is active', 'status'], images: ['image', 'images', 'image url'] };
      const columnMapping: Partial<Record<ProductImportField, string>> = {};
      for (const [field, names] of Object.entries(aliases) as Array<[ProductImportField, string[]]>) {
        const match = headers.find((header) => names.includes(header.toLowerCase()));
        if (match) columnMapping[field] = match;
      }
      if (!columnMapping.name) { Alert.alert('Product name column required', 'The CSV needs a “name”, “product name”, or “title” column.'); return; }
      importMutation.mutate({ csvText, fileName: asset.name, columnMapping });
    } catch (error) { Alert.alert('Could not read CSV', error instanceof Error ? error.message : 'Please choose another file.'); }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Products" subtitle="Manage your product catalog" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <View style={styles.topActions}><AppButton icon={Plus} label="Create product" onPress={() => navigation.navigate('ProductForm', undefined)} /><AppButton icon={Import} label="Import CSV" variant="secondary" loading={importMutation.isPending} onPress={() => void importCsv()} /><AppButton icon={Download} label="Export CSV" variant="secondary" loading={exportMutation.isPending} onPress={() => exportMutation.mutate()} /></View>
        {importsQuery.data?.items[0] ? <Text style={[styles.jobStatus, { color: importsQuery.data.items[0].status === 'FAILED' ? colors.error : colors.textSecondary }]}>{importsQuery.data.items[0].status === 'COMPLETED' ? `Last import: ${importsQuery.data.items[0].importedRows} products added` : `Product import: ${importsQuery.data.items[0].status.toLowerCase()}`}</Text> : null}
        {exportsQuery.data?.items[0] ? <Text style={[styles.jobStatus, { color: exportsQuery.data.items[0].status === 'FAILED' ? colors.error : colors.textSecondary }]}>{`Latest product export: ${exportsQuery.data.items[0].status.toLowerCase()}`}</Text> : null}
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {['ALL', 'LOW_STOCK', 'OUT_OF_STOCK'].map((item) => <Pressable key={item} onPress={() => { setAvailability(item as typeof availability); setPage(1); }} style={[styles.filter, { backgroundColor: availability === item ? colors.primary : colors.surfaceSecondary }]}><Text style={[styles.filterText, { color: availability === item ? colors.primaryText : colors.textSecondary }]}>{item === 'ALL' ? 'Any stock' : item.replace('_', ' ')}</Text></Pressable>)}
          <Pressable onPress={() => { setLocalOnly((value) => !value); setPage(1); }} style={[styles.filter, { backgroundColor: localOnly ? colors.primary : colors.surfaceSecondary }]}><Text style={[styles.filterText, { color: localOnly ? colors.primaryText : colors.textSecondary }]}>Local only</Text></Pressable>
        </ScrollView>
        {(categoriesQuery.data?.items ?? []).length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {[{ id: 'ALL', name: 'All categories' }, ...(categoriesQuery.data?.items ?? [])].map((item) => <Pressable key={item.id} onPress={() => { setCategory(item.id === 'ALL' ? 'ALL' : item.name); setPage(1); }} style={[styles.filter, { backgroundColor: (item.id === 'ALL' ? category === 'ALL' : category === item.name) ? colors.primary : colors.surfaceSecondary }]}><Text style={[styles.filterText, { color: (item.id === 'ALL' ? category === 'ALL' : category === item.name) ? colors.primaryText : colors.textSecondary }]}>{item.name}</Text></Pressable>)}
        </ScrollView> : null}
        {(channelsQuery.data?.items ?? []).filter((channel) => channel.status === 'CONNECTED').length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{(channelsQuery.data?.items ?? []).filter((channel) => channel.status === 'CONNECTED').map((channel) => { const active = salesChannelIds.includes(channel.id); return <Pressable key={channel.id} onPress={() => { setSalesChannelIds((current) => active ? current.filter((id) => id !== channel.id) : [...current, channel.id]); setSelectedIds([]); setPage(1); }} style={[styles.filter, { backgroundColor: active ? colors.primarySoft : colors.surface, borderColor: active ? colors.primary : colors.cardBorder, borderWidth: 1 }]}><Text style={[styles.filterText, { color: active ? colors.primary : colors.textSecondary }]}>{channel.name}</Text></Pressable>; })}</ScrollView> : null}
        {selectedIds.length ? <AppCard style={styles.bulkCard}><Text style={{ color: colors.text }}>{selectedIds.length} selected</Text><AppButton label="Delete selected" variant="destructive" loading={bulkDeleteMutation.isPending} onPress={() => Alert.alert('Remove selected products?', 'Products published to connected catalogs may be archived instead of deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => bulkDeleteMutation.mutate(selectedIds) }])} /></AppCard> : null}
        {productsQuery.isLoading ? <FormSkeleton fields={5} /> : productsQuery.isError ? <ErrorState message="Could not load products." onRetry={() => productsQuery.refetch()} /> : products.length ? products.map((product) => (
          <ProductRow key={product.id} product={product} selected={selectedIds.includes(product.id)} onSelect={() => setSelectedIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} onEdit={() => navigation.navigate('ProductForm', { productId: product.id })} onToggle={() => statusMutation.mutate({ product, next: product.status !== 'ACTIVE' })} onDelete={() => Alert.alert('Delete product?', `Delete ${product.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(product.id) }])} />
        )) : <AppCard><Text style={[styles.empty, { color: colors.textMuted }]}>No products found.</Text></AppCard>}
        {statusMutation.isPending || deleteMutation.isPending ? <ActivityIndicator color={colors.primary} /> : null}
        <View style={styles.pagination}><AppButton label="Previous" variant="secondary" disabled={page <= 1} onPress={() => setPage((value) => Math.max(1, value - 1))} /><Text style={{ color: colors.textSecondary }}>{products.length} products · Page {page}</Text><AppButton label="Next" variant="secondary" disabled={products.length < 25} onPress={() => setPage((value) => value + 1)} /></View>
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
  topActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bulkCard: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectButton: { alignItems: 'center', borderRadius: radius.sm, height: 24, justifyContent: 'center', width: 24 },
  jobStatus: { fontSize: fontSize.small },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  empty: { fontSize: fontSize.body, textAlign: 'center' },
});
