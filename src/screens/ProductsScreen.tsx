import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Check, Download, Filter, Import, Package, Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteProduct, deleteProducts, exportProducts, fetchProductExports, fetchProductImports, importProducts, listProducts, updateProductStatus, type ProductImportField, type ProductResponse } from '../api/products';
import { fetchChannels } from '../api/channels';
import { fetchProductCategories } from '../api/productCategories';
import { ErrorState } from '../components/ErrorState';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { ChannelLogo } from '../components/ChannelLogo';
import { FormSkeleton } from '../components/Skeleton';
import { ProductFormScreen } from './ProductFormScreen';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppCard, AppChip, AppText, ScreenHeader } from '../ui';

const STATUS_FILTERS = ['ALL', 'DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
const PRODUCT_FILTER_LAYERS = [
  { id: 'status', label: 'Status' },
  { id: 'stock', label: 'Stock' },
  { id: 'category', label: 'Category' },
  { id: 'channels', label: 'Channels' },
  { id: 'more', label: 'More' },
] as const;
type ProductFilterLayer = (typeof PRODUCT_FILTER_LAYERS)[number]['id'];

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
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [filterLayer, setFilterLayer] = useState<ProductFilterLayer>('status');
  const [draftStatus, setDraftStatus] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [draftAvailability, setDraftAvailability] = useState<typeof availability>('ALL');
  const [draftCategory, setDraftCategory] = useState('ALL');
  const [draftLocalOnly, setDraftLocalOnly] = useState(false);
  const [draftSalesChannelIds, setDraftSalesChannelIds] = useState<string[]>([]);
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
  const activeFilterCount = Number(status !== 'ALL') + Number(availability !== 'ALL') + Number(category !== 'ALL') + Number(localOnly) + salesChannelIds.length;
  const draftHasFilters = draftStatus !== 'ALL' || draftAvailability !== 'ALL' || draftCategory !== 'ALL' || draftLocalOnly || draftSalesChannelIds.length > 0;
  const openFilters = () => {
    setDraftStatus(status);
    setDraftAvailability(availability);
    setDraftCategory(category);
    setDraftLocalOnly(localOnly);
    setDraftSalesChannelIds(salesChannelIds);
    setFiltersVisible(true);
  };
  const resetDraftFilters = () => {
    setDraftStatus('ALL');
    setDraftAvailability('ALL');
    setDraftCategory('ALL');
    setDraftLocalOnly(false);
    setDraftSalesChannelIds([]);
  };
  const applyFilters = () => {
    setStatus(draftStatus);
    setAvailability(draftAvailability);
    setCategory(draftCategory);
    setLocalOnly(draftLocalOnly);
    setSalesChannelIds(draftSalesChannelIds);
    setSelectedIds([]);
    setPage(1);
    setFiltersVisible(false);
  };

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
        <View style={styles.productActions}>
          <AppButton icon={Plus} label="Create" onPress={() => setCreateSheetVisible(true)} style={styles.createProductButton} />
          <Pressable onPress={() => void importCsv()} disabled={importMutation.isPending} style={[styles.dataAction, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} accessibilityRole="button" accessibilityLabel="Import products from CSV">
            {importMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Import color={colors.primary} size={17} />}
            <Text style={[styles.dataActionLabel, { color: colors.text }]}>Import</Text>
          </Pressable>
          <Pressable onPress={() => exportMutation.mutate()} disabled={exportMutation.isPending} style={[styles.dataAction, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} accessibilityRole="button" accessibilityLabel="Export products to CSV">
            {exportMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Download color={colors.primary} size={17} />}
            <Text style={[styles.dataActionLabel, { color: colors.text }]}>Export</Text>
          </Pressable>
        </View>
        {importsQuery.data?.items[0] ? <Text style={[styles.jobStatus, { color: importsQuery.data.items[0].status === 'FAILED' ? colors.error : colors.textSecondary }]}>{importsQuery.data.items[0].status === 'COMPLETED' ? `Last import: ${importsQuery.data.items[0].importedRows} products added` : `Product import: ${importsQuery.data.items[0].status.toLowerCase()}`}</Text> : null}
        {exportsQuery.data?.items[0] ? <Text style={[styles.jobStatus, { color: exportsQuery.data.items[0].status === 'FAILED' ? colors.error : colors.textSecondary }]}>{`Latest product export: ${exportsQuery.data.items[0].status.toLowerCase()}`}</Text> : null}
        <View style={styles.searchTools}>
          <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Search color={colors.textMuted} size={17} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search products" placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.text }]} />
          </View>
          <Pressable onPress={openFilters} style={[styles.filterIconButton, { backgroundColor: colors.surface, borderColor: activeFilterCount ? colors.primary : colors.cardBorder }]} accessibilityRole="button" accessibilityLabel={activeFilterCount ? `Filters, ${activeFilterCount} active` : 'Filters'}>
            <Filter color={activeFilterCount ? colors.primary : colors.textSecondary} size={18} />
            {activeFilterCount ? <View style={[styles.filterActiveDot, { backgroundColor: colors.primary }]} /> : null}
          </Pressable>
        </View>
        <BottomSheet visible={filtersVisible} onClose={() => setFiltersVisible(false)} sheetStyle={styles.filterSheet}>
          <View style={styles.sheetHeader}><AppText variant="heading">Filters</AppText></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterLayerTabs, { backgroundColor: colors.surfaceSecondary }]} contentContainerStyle={styles.filterLayerTabsContent}>
            {PRODUCT_FILTER_LAYERS.map((layer) => {
              const active = filterLayer === layer.id;
              const count = layer.id === 'status' ? Number(draftStatus !== 'ALL') : layer.id === 'stock' ? Number(draftAvailability !== 'ALL') : layer.id === 'category' ? Number(draftCategory !== 'ALL') : layer.id === 'channels' ? draftSalesChannelIds.length : Number(draftLocalOnly);
              return <Pressable key={layer.id} style={[styles.filterLayerTab, active && styles.filterLayerTabActive, active && { backgroundColor: colors.surface }]} onPress={() => setFilterLayer(layer.id)}><Text style={[styles.filterLayerTabText, { color: active ? colors.text : colors.textSecondary }]}>{layer.label}</Text>{count ? <Text style={[styles.filterLayerCount, { color: colors.primary, backgroundColor: `${colors.primary}18` }]}>{count}</Text> : null}</Pressable>;
            })}
          </ScrollView>
          <SheetScrollView style={styles.filterLayerBody} contentContainerStyle={styles.filterLayerContent} keyboardShouldPersistTaps="handled">
            {filterLayer === 'status' ? <View style={styles.filterChoices}>{STATUS_FILTERS.map((item) => <AppChip key={item} label={item === 'ALL' ? 'All' : item[0] + item.slice(1).toLowerCase()} selected={draftStatus === item} onPress={() => setDraftStatus(item)} />)}</View> : null}
            {filterLayer === 'stock' ? <View style={styles.filterChoices}>{(['ALL', 'LOW_STOCK', 'OUT_OF_STOCK'] as const).map((item) => <AppChip key={item} label={item === 'ALL' ? 'Any stock' : item === 'LOW_STOCK' ? 'Low stock' : 'Out of stock'} selected={draftAvailability === item} onPress={() => setDraftAvailability(item)} />)}</View> : null}
            {filterLayer === 'category' ? <View style={styles.filterChoices}>{[{ id: 'ALL', name: 'All categories' }, ...(categoriesQuery.data?.items ?? [])].map((item) => { const selected = item.id === 'ALL' ? draftCategory === 'ALL' : draftCategory === item.name; return <AppChip key={item.id} label={item.name} selected={selected} onPress={() => setDraftCategory(item.id === 'ALL' ? 'ALL' : item.name)} />; })}</View> : null}
            {filterLayer === 'channels' ? (channelsQuery.data?.items ?? []).filter((channel) => channel.status === 'CONNECTED').length ? <View style={styles.filterChoices}>{(channelsQuery.data?.items ?? []).filter((channel) => channel.status === 'CONNECTED').map((channel) => { const selected = draftSalesChannelIds.includes(channel.id); return <Pressable key={channel.id} onPress={() => setDraftSalesChannelIds((current) => selected ? current.filter((id) => id !== channel.id) : [...current, channel.id])} style={[styles.channelFilter, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.cardBorder }]} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}><ChannelLogo type={channel.type} box={22} glyph={12} radius={8} /><Text numberOfLines={1} style={[styles.channelFilterLabel, { color: selected ? colors.primary : colors.textSecondary }]}>{channel.name}</Text>{selected ? <Check color={colors.primary} size={14} /> : null}</Pressable>; })}</View> : <AppText variant="small" tone="muted">No connected sales channels.</AppText> : null}
            {filterLayer === 'more' ? <Pressable onPress={() => setDraftLocalOnly((value) => !value)} style={[styles.localOnlyRow, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]} accessibilityRole="checkbox" accessibilityState={{ checked: draftLocalOnly }}><View style={[styles.checkbox, { borderColor: draftLocalOnly ? colors.primary : colors.cardBorder, backgroundColor: draftLocalOnly ? colors.primary : colors.surface }]}>{draftLocalOnly ? <Check size={14} color={colors.primaryText} /> : null}</View><View style={styles.sheetTitleGroup}><AppText variant="bodyStrong">Local products only</AppText><AppText variant="small" tone="secondary">Exclude products published to sales channels.</AppText></View></Pressable> : null}
          </SheetScrollView>
          <Pressable style={[styles.filterReset, !draftHasFilters && styles.filterResetDisabled]} onPress={resetDraftFilters} disabled={!draftHasFilters}><Text style={[styles.filterResetText, { color: draftHasFilters ? colors.error : colors.textMuted }]}>Clear all</Text></Pressable>
          <Pressable style={[styles.filterApply, { backgroundColor: colors.primary }]} onPress={applyFilters}><Text style={[styles.filterApplyText, { color: colors.primaryText }]}>Apply filters</Text></Pressable>
        </BottomSheet>
        <BottomSheet visible={createSheetVisible} onClose={() => setCreateSheetVisible(false)} sheetStyle={styles.createSheet}>
          {createSheetVisible ? <ProductFormScreen embedded onClose={() => setCreateSheetVisible(false)} onSaved={() => setCreateSheetVisible(false)} /> : null}
        </BottomSheet>
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
  searchTools: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  search: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontSize: fontSize.body, height: 48 },
  filters: { gap: spacing.sm },
  filterIconButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, height: 48, justifyContent: 'center', position: 'relative', width: 48 },
  filterActiveDot: { borderRadius: radius.pill, height: spacing.sm, position: 'absolute', right: 5, top: 5, width: spacing.sm },
  filterSheet: { paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  createSheet: { height: '92%' },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  sheetTitleGroup: { flex: 1, gap: 3 },
  filterLayerTabs: { borderRadius: radius.lg, flexGrow: 0, marginBottom: spacing.md, padding: spacing.xs },
  filterLayerTabsContent: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  filterLayerTab: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 4, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  filterLayerTabActive: { elevation: 1, shadowOpacity: 0.06, shadowRadius: 4 },
  filterLayerTabText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  filterLayerCount: { borderRadius: 8, fontSize: 10, fontWeight: '700', marginLeft: 3, overflow: 'hidden', paddingHorizontal: 4, paddingVertical: 1 },
  filterLayerBody: { maxHeight: 400 },
  filterLayerContent: { paddingBottom: spacing.sm },
  filterChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  channelFilter: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, maxWidth: '100%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  channelFilterLabel: { flexShrink: 1, fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  localOnlyRow: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  checkbox: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  filterReset: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  filterResetDisabled: { opacity: 0.45 },
  filterResetText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  filterApply: { alignItems: 'center', borderRadius: radius.md, marginTop: spacing.sm, paddingVertical: spacing.md + 2 },
  filterApplyText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
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
  productActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  createProductButton: { flex: 1 },
  dataAction: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, height: 38, justifyContent: 'center', paddingHorizontal: spacing.sm },
  dataActionLabel: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  bulkCard: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectButton: { alignItems: 'center', borderRadius: radius.sm, height: 24, justifyContent: 'center', width: 24 },
  jobStatus: { fontSize: fontSize.small },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  empty: { fontSize: fontSize.body, textAlign: 'center' },
});
