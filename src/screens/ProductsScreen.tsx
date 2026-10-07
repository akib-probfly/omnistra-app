import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { AlertTriangle, Archive, Check, CheckCircle2, Download, EllipsisVertical, Filter, Import, LayoutGrid, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteProduct, deleteProducts, exportProducts, fetchProductExports, fetchProductImports, importProducts, listProducts, updateProductStatus, type ProductExportMode, type ProductImportField, type ProductResponse } from '../api/products';
import { fetchChannels } from '../api/channels';
import { fetchProductCategories } from '../api/productCategories';
import { ErrorState } from '../components/ErrorState';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { ChannelLogo } from '../components/ChannelLogo';
import { FormSkeleton } from '../components/Skeleton';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppCard, AppChip, AppText, ScreenHeader } from '../ui';

const STATUS_FILTERS = ['ALL', 'DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
function productStatusFilterColor(status: (typeof STATUS_FILTERS)[number], colors: ReturnType<typeof useTheme>['colors']) {
  if (status === 'ACTIVE') return colors.success;
  if (status === 'DRAFT') return colors.warning;
  if (status === 'INACTIVE' || status === 'ARCHIVED') return colors.error;
  return colors.textSecondary;
}
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
  const imageUrl = product.coverImageUrl || product.imageUrls.find(Boolean) || null;
  return (
    <AppCard style={styles.productCard} padding="sm" radiusKey="lg">
      <View style={styles.productHeader}>
        <View style={[styles.icon, styles.productCardIcon, { backgroundColor: colors.primarySoft }]}>{imageUrl ? <Image source={{ uri: imageUrl }} style={styles.productImage} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={`${product.name} image`} /> : <Package color={colors.primary} size={17} />}</View>
        <View style={styles.productCopy}>
          <Text style={[styles.productName, styles.productCardName, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
          <Text style={[styles.productMeta, styles.productCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>{product.sku || product.category || 'No SKU or category'}</Text>
        </View>
        <AppBadge size="sm" tone={active ? 'success' : product.status === 'ARCHIVED' ? 'neutral' : 'warning'} label={product.status} />
        <Pressable onPress={onSelect} hitSlop={6} style={[styles.selectButton, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.cardBorder }]} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={selected ? `Deselect ${product.name}` : `Select ${product.name}`}>{selected ? <Check color={colors.primaryText} size={14} strokeWidth={2.5} /> : null}</Pressable>
      </View>
      <View style={styles.productDetails}>
        <Text style={[styles.price, styles.productCardPrice, { color: colors.text }]}>{formatPrice(product)}</Text>
        <Text style={[styles.inventory, styles.productCardInventory, { color: colors.textSecondary }]}>Stock: {product.inventory ?? 'Not set'}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onEdit} style={[styles.productActionButton, styles.productActionSecondary, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} accessibilityRole="button"><Pencil color={colors.primary} size={14} /><Text style={[styles.productActionLabel, { color: colors.text }]}>Edit</Text></Pressable>
        <Pressable onPress={onToggle} style={[styles.productActionButton, styles.productActionSecondary, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} accessibilityRole="button"><CheckCircle2 color={active ? colors.warning : colors.success} size={14} /><Text style={[styles.productActionLabel, { color: colors.text }]}>{active ? 'Deactivate' : 'Activate'}</Text></Pressable>
        <Pressable onPress={onDelete} style={[styles.productActionButton, styles.productActionDestructive, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }]} accessibilityRole="button"><Trash2 color={colors.error} size={14} /><Text style={[styles.productActionLabel, { color: colors.error }]}>Delete</Text></Pressable>
      </View>
    </AppCard>
  );
}

export function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
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
  const [productMenuVisible, setProductMenuVisible] = useState(false);
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
  const productMetricWidth = (windowWidth - spacing.lg * 2 - spacing.xs * 2) / 3;
  const productMetrics = [
    { label: 'Total Products', value: productsQuery.data?.total ?? 0, Icon: LayoutGrid, background: colors.primarySoft, foreground: colors.primary },
    { label: 'Active Products', value: products.filter((product) => product.status === 'ACTIVE').length, Icon: CheckCircle2, background: colors.successSoft, foreground: colors.success },
    { label: 'Draft Products', value: products.filter((product) => product.status === 'DRAFT').length, Icon: AlertTriangle, background: colors.warningSoft, foreground: colors.amber },
    { label: 'Inactive / Archived', value: products.filter((product) => product.status === 'INACTIVE' || product.status === 'ARCHIVED').length, Icon: Archive, background: colors.dangerSoft, foreground: colors.error },
  ];
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
  const exportProductsMode = (mode: ProductExportMode) => {
    if (mode === 'selected' && selectedIds.length === 0) return;
    const filters = {
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(category !== 'ALL' ? { category: [category] } : {}),
      ...(status !== 'ALL' ? { status: [status] } : {}),
      ...(availability !== 'ALL' ? { availability: [availability] } : {}),
      ...(salesChannelIds.length ? { salesChannelIds } : {}),
      ...(localOnly ? { localOnly: true } : {}),
    };
    setProductMenuVisible(false);
    exportMutation.mutate({ mode, ...(mode === 'selected' ? { productIds: selectedIds } : {}), ...(mode === 'filtered' ? { filters } : {}) });
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
      <ScreenHeader title="Products" onBack={() => navigation.goBack()} right={<View style={styles.headerActions}><Pressable onPress={() => navigation.navigate('ProductForm')} style={[styles.createHeaderButton, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel="Create product"><Plus color={colors.primaryText} size={20} /></Pressable><Pressable onPress={() => setProductMenuVisible((visible) => !visible)} style={[styles.menuButton, { backgroundColor: colors.surfaceSecondary }]} accessibilityRole="button" accessibilityLabel="More product actions"><EllipsisVertical color={colors.text} size={21} /></Pressable></View>} />
      <BottomSheet visible={productMenuVisible} onClose={() => setProductMenuVisible(false)} sheetStyle={styles.productActionsSheet}>
        <Text style={[styles.productActionsTitle, { color: colors.text }]}>Product actions</Text>
          <Pressable onPress={() => exportProductsMode('all')} disabled={exportMutation.isPending} style={styles.menuAction} accessibilityRole="button" accessibilityLabel="Export all products">{exportMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Download color={colors.textSecondary} size={17} />}<Text style={[styles.menuActionLabel, { color: exportMutation.isPending ? colors.textMuted : colors.text }]}>Export all</Text></Pressable>
          <Pressable onPress={() => exportProductsMode('filtered')} disabled={exportMutation.isPending} style={styles.menuAction} accessibilityRole="button" accessibilityLabel="Export filtered products">{exportMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Download color={colors.textSecondary} size={17} />}<Text style={[styles.menuActionLabel, { color: exportMutation.isPending ? colors.textMuted : colors.text }]}>Export filtered</Text></Pressable>
          <Pressable onPress={() => exportProductsMode('selected')} disabled={exportMutation.isPending || selectedIds.length === 0} style={[styles.menuAction, (exportMutation.isPending || selectedIds.length === 0) && styles.menuActionDisabled]} accessibilityRole="button" accessibilityState={{ disabled: exportMutation.isPending || selectedIds.length === 0 }}>{exportMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Check color={colors.textSecondary} size={17} />}<Text style={[styles.menuActionLabel, { color: exportMutation.isPending || selectedIds.length === 0 ? colors.textMuted : colors.text }]}>Export selected</Text></Pressable>
          <View style={[styles.menuDivider, styles.actionsMenuDivider, { backgroundColor: colors.cardBorder }]} />
          <Pressable onPress={() => { setProductMenuVisible(false); void importCsv(); }} disabled={importMutation.isPending} style={styles.menuAction} accessibilityRole="button" accessibilityLabel="Import products from CSV">{importMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Import color={colors.text} size={17} />}<Text style={[styles.menuActionLabel, { color: importMutation.isPending ? colors.textMuted : colors.text }]}>Import Products</Text></Pressable>
      </BottomSheet>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <View style={styles.productMetricsGrid}>
          {productMetrics.map(({ label, value, Icon, background, foreground }) => <View key={label} style={[styles.productMetricCard, { width: productMetricWidth, backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><View style={[styles.productMetricIcon, { backgroundColor: background }]}><Icon color={foreground} size={17} /></View><View style={styles.productMetricCopy}><Text numberOfLines={2} style={[styles.productMetricLabel, { color: colors.textSecondary }]}>{label}</Text><Text style={[styles.productMetricValue, { color: colors.text }]}>{value}</Text></View></View>)}
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
            {filterLayer === 'status' ? <View style={styles.filterChoices}>{STATUS_FILTERS.map((item) => <AppChip key={item} label={item === 'ALL' ? 'All' : item[0] + item.slice(1).toLowerCase()} selected={draftStatus === item} labelColor={productStatusFilterColor(item, colors)} onPress={() => setDraftStatus(item)} />)}</View> : null}
            {filterLayer === 'stock' ? <View style={styles.filterChoices}>{(['ALL', 'LOW_STOCK', 'OUT_OF_STOCK'] as const).map((item) => <AppChip key={item} label={item === 'ALL' ? 'Any stock' : item === 'LOW_STOCK' ? 'Low stock' : 'Out of stock'} selected={draftAvailability === item} onPress={() => setDraftAvailability(item)} />)}</View> : null}
            {filterLayer === 'category' ? <View style={styles.filterChoices}>{[{ id: 'ALL', name: 'All categories' }, ...(categoriesQuery.data?.items ?? [])].map((item) => { const selected = item.id === 'ALL' ? draftCategory === 'ALL' : draftCategory === item.name; return <AppChip key={item.id} label={item.name} selected={selected} onPress={() => setDraftCategory(item.id === 'ALL' ? 'ALL' : item.name)} />; })}</View> : null}
            {filterLayer === 'channels' ? (channelsQuery.data?.items ?? []).filter((channel) => channel.status === 'CONNECTED').length ? <View style={styles.filterChoices}>{(channelsQuery.data?.items ?? []).filter((channel) => channel.status === 'CONNECTED').map((channel) => { const selected = draftSalesChannelIds.includes(channel.id); return <Pressable key={channel.id} onPress={() => setDraftSalesChannelIds((current) => selected ? current.filter((id) => id !== channel.id) : [...current, channel.id])} style={[styles.channelFilter, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.cardBorder }]} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}><ChannelLogo type={channel.type} box={22} glyph={12} radius={8} /><Text numberOfLines={1} style={[styles.channelFilterLabel, { color: selected ? colors.primary : colors.textSecondary }]}>{channel.name}</Text>{selected ? <Check color={colors.primary} size={14} /> : null}</Pressable>; })}</View> : <AppText variant="small" tone="muted">No connected sales channels.</AppText> : null}
            {filterLayer === 'more' ? <Pressable onPress={() => setDraftLocalOnly((value) => !value)} style={[styles.localOnlyRow, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]} accessibilityRole="checkbox" accessibilityState={{ checked: draftLocalOnly }}><View style={[styles.checkbox, { borderColor: draftLocalOnly ? colors.primary : colors.cardBorder, backgroundColor: draftLocalOnly ? colors.primary : colors.surface }]}>{draftLocalOnly ? <Check size={14} color={colors.primaryText} /> : null}</View><View style={styles.sheetTitleGroup}><AppText variant="bodyStrong">Local products only</AppText><AppText variant="small" tone="secondary">Exclude products published to sales channels.</AppText></View></Pressable> : null}
          </SheetScrollView>
          <Pressable style={[styles.filterReset, !draftHasFilters && styles.filterResetDisabled]} onPress={resetDraftFilters} disabled={!draftHasFilters}><Text style={[styles.filterResetText, { color: draftHasFilters ? colors.error : colors.textMuted }]}>Clear all</Text></Pressable>
          <Pressable style={[styles.filterApply, { backgroundColor: colors.primary }]} onPress={applyFilters}><Text style={[styles.filterApplyText, { color: colors.primaryText }]}>Apply filters</Text></Pressable>
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
  productMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  productMetricCard: { alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', flexShrink: 0, gap: spacing.xs, minHeight: 52, padding: spacing.xs + 2 },
  productMetricIcon: { alignItems: 'center', borderRadius: radius.pill, height: 26, justifyContent: 'center', width: 26 },
  productMetricCopy: { flex: 1, minWidth: 0 },
  productMetricLabel: { fontSize: 9, lineHeight: 11 },
  productMetricValue: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  screen: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg },
  searchTools: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  search: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontSize: fontSize.body, height: 48 },
  filters: { gap: spacing.sm },
  filterIconButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, height: 48, justifyContent: 'center', position: 'relative', width: 48 },
  filterActiveDot: { borderRadius: radius.pill, height: spacing.sm, position: 'absolute', right: 5, top: 5, width: spacing.sm },
  filterSheet: { paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
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
  checkbox: { alignItems: 'center', borderRadius: 5, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 },
  filterReset: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  filterResetDisabled: { opacity: 0.45 },
  filterResetText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  filterApply: { alignItems: 'center', borderRadius: radius.md, marginTop: spacing.sm, paddingVertical: spacing.md + 2 },
  filterApplyText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  filter: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterText: { fontSize: fontSize.small, fontWeight: fontWeight.bold },
  productCard: { gap: spacing.sm },
  productHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  productCardIcon: { height: 32, width: 32 },
  icon: { alignItems: 'center', borderRadius: radius.md, height: 40, justifyContent: 'center', overflow: 'hidden', width: 40 },
  productImage: { height: '100%', width: '100%' },
  productCopy: { flex: 1, minWidth: 0 },
  productName: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold },
  productCardName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  productMeta: { fontSize: fontSize.small, marginTop: 2 },
  productCardMeta: { fontSize: fontSize.tiny, marginTop: 0 },
  productDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  price: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  productCardPrice: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  inventory: { fontSize: fontSize.small },
  productCardInventory: { fontSize: fontSize.tiny },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  productActionButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, height: 38, justifyContent: 'center', paddingHorizontal: spacing.xs },
  productActionSecondary: { flex: 1 },
  productActionDestructive: { minWidth: 78, paddingHorizontal: spacing.sm },
  productActionLabel: { fontSize: fontSize.tiny, fontWeight: fontWeight.semibold },
  productActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  createHeaderButton: { alignItems: 'center', borderRadius: radius.pill, height: 38, justifyContent: 'center', width: 38 },
  menuButton: { alignItems: 'center', borderRadius: radius.pill, height: 38, justifyContent: 'center', width: 38 },
  productActionsSheet: { gap: spacing.xs, paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  productActionsTitle: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  menuAction: { alignItems: 'center', borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.sm },
  menuActionDisabled: { opacity: 0.55 },
  menuActionLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
  menuDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },
  actionsMenuDivider: { marginVertical: spacing.xs },
  bulkCard: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  selectButton: { alignItems: 'center', borderRadius: 5, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  jobStatus: { fontSize: fontSize.small },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  empty: { fontSize: fontSize.body, textAlign: 'center' },
});
