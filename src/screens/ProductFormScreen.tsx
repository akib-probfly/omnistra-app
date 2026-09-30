import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Check, Plus, Save, Store, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createProduct, fetchProduct, updateProduct, type ProductInput, type ProductResponse } from '../api/products';
import { fetchChannels, fetchWhatsappProductCatalog } from '../api/channels';
import { createProductCategory, fetchProductCategories } from '../api/productCategories';
import { uploadFile } from '../api/client';
import { ErrorState } from '../components/ErrorState';
import { SheetScrollView } from '../components/BottomSheet';
import { FormSkeleton } from '../components/Skeleton';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { spacing } from '../theme/tokens';
import { AppButton, AppCard, AppTextField, ScreenHeader } from '../ui';

type FormState = {
  name: string;
  sku: string;
  category: string;
  categoryId: string;
  price: string;
  salePrice: string;
  inventory: string;
  stockAlert: string;
  description: string;
  currency: string;
  weight: string;
  dimensionL: string;
  dimensionW: string;
  dimensionH: string;
  isActive: boolean;
  attributes: Array<{ name: string; values: string }>;
};

const EMPTY_FORM: FormState = {
  name: '', sku: '', category: '', categoryId: '', price: '', salePrice: '', inventory: '', stockAlert: '', description: '', currency: 'USD', weight: '0.05', dimensionL: '', dimensionW: '', dimensionH: '', isActive: true, attributes: [],
};

function productToForm(product: ProductResponse): FormState {
  return {
    name: product.name,
    sku: product.sku ?? '',
    category: product.category ?? '',
    categoryId: product.categoryId ?? '',
    price: product.priceMinor === null ? '' : (product.priceMinor / 100).toFixed(2),
    salePrice: product.salePriceMinor === null ? '' : (product.salePriceMinor / 100).toFixed(2),
    inventory: product.inventory === null ? '' : String(product.inventory),
    stockAlert: product.stockAlert === null ? '' : String(product.stockAlert),
    description: product.descriptionMarkdown ?? '',
    currency: product.currency ?? 'USD',
    weight: product.weightGrams === null ? '' : String(product.weightGrams / 1000),
    dimensionL: String(product.dimensions?.length ?? ''),
    dimensionW: String(product.dimensions?.width ?? ''),
    dimensionH: String(product.dimensions?.height ?? ''),
    isActive: product.status === 'ACTIVE',
    attributes: Array.isArray(product.attributes) ? product.attributes.filter((item): item is { name: string; values: string } => typeof item === 'object' && item !== null && 'name' in item && 'values' in item).map((item) => ({ name: String(item.name), values: String(item.values) })) : [],
  };
}

export function ProductFormScreen({ embedded = false, onClose, onSaved }: { embedded?: boolean; onClose?: () => void; onSaved?: () => void }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SettingsStackParamList, 'ProductForm'>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { workspace } = useWorkspaceAccess();
  const productId = embedded ? undefined : route.params?.productId;
  const editing = Boolean(productId);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<Array<{ uri: string; imageUrl?: string; attachmentId?: string }>>([]);
  const [newCategory, setNewCategory] = useState('');
  const [selectedCatalogs, setSelectedCatalogs] = useState<Array<{ channelId: string; catalogId: string }>>([]);
  const channelsQuery = useQuery({ queryKey: ['channels'], queryFn: fetchChannels });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: () => fetchProductCategories(workspace?.id), enabled: Boolean(workspace?.id) });
  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId as string),
    enabled: editing,
  });
  const connectedWhatsapp = (channelsQuery.data?.items ?? []).filter((channel) => channel.type === 'WHATSAPP' && channel.status === 'CONNECTED');
  const catalogQueries = useQueries({ queries: connectedWhatsapp.map((channel) => ({ queryKey: ['whatsapp-product-catalog', channel.id], queryFn: () => fetchWhatsappProductCatalog(channel.id), enabled: !editing || Boolean(productQuery.data) })) });
  const catalogOptions = useMemo(() => connectedWhatsapp.flatMap((channel, index) => {
    const result = catalogQueries[index]?.data;
    const catalog = result?.activeCatalog ?? result?.catalogs?.[0] ?? null;
    return catalog ? [{ channelId: channel.id, channelName: channel.name, catalogId: catalog.id, catalogName: catalog.name || 'WhatsApp catalog' }] : [];
  }), [catalogQueries, connectedWhatsapp]);
  const catalogsReady = !channelsQuery.isLoading && !channelsQuery.isError && catalogQueries.every((query) => !query.isLoading && !query.isError);
  useEffect(() => {
    if (productQuery.data) {
      setForm(productToForm(productQuery.data));
      setImages((productQuery.data.imageUrls ?? []).map((imageUrl) => ({ uri: imageUrl, imageUrl })));
      setSelectedCatalogs(productQuery.data.salesChannels.flatMap((item) => item.catalogId ? [{ channelId: item.channelId, catalogId: item.catalogId }] : []));
    }
  }, [productQuery.data]);

  const updateField = (key: keyof FormState) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const toOptionalNumber = (value: string) => value.trim() ? Number(value) : undefined;
  const payload = (): ProductInput => ({
    name: form.name.trim(),
    sku: form.sku.trim() || undefined,
    category: form.category.trim() || undefined,
    categoryId: form.categoryId || undefined,
    basePrice: form.price.trim() || undefined,
    salePrice: form.salePrice.trim() || undefined,
    initialStock: toOptionalNumber(form.inventory),
    stockAlert: toOptionalNumber(form.stockAlert),
    description: form.description.trim() || undefined,
    currency: form.currency.trim() || 'USD',
    weight: form.weight.trim() || undefined,
    dimensionL: form.dimensionL.trim() || undefined,
    dimensionW: form.dimensionW.trim() || undefined,
    dimensionH: form.dimensionH.trim() || undefined,
    isActive: form.isActive,
    attributes: form.attributes.filter((item) => item.name.trim() && item.values.trim()),
    ...(catalogsReady ? { whatsappCatalogs: selectedCatalogs } : {}),
    imageUrls: images.flatMap((item) => item.imageUrl ? [item.imageUrl] : []),
    imageAttachmentIds: images.flatMap((item) => item.attachmentId ? [item.attachmentId] : []),
  });

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const category = await createProductCategory(newCategory.trim(), workspace?.id);
      await queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      setForm((current) => ({ ...current, category: category.name, categoryId: category.id }));
      setNewCategory('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add category.'); }
  };
  const mutation = useMutation({
    mutationFn: () => {
      const input = payload();
      return editing ? updateProduct(productId as string, input) : createProduct(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      if (editing) await queryClient.invalidateQueries({ queryKey: ['product', productId] });
      if (embedded) onSaved?.();
      else navigation.goBack();
    },
    onError: (value: Error) => setError(value.message),
  });

  const pickImages = async () => {
    if (!workspace?.id) {
      setError('Workspace is not ready for image upload.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, 8 - images.length), quality: 0.85 });
    if (result.canceled) return;
    try {
      const uploaded = await Promise.all(result.assets.map((asset) => uploadFile('/files/upload', asset.uri, asset.fileName ?? `product-${Date.now()}.jpg`, asset.mimeType ?? 'image/jpeg', { workspaceId: workspace.id })));
      setImages((current) => [...current, ...result.assets.map((asset, index) => ({ uri: asset.uri, attachmentId: uploaded[index].id }))].slice(0, 8));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not upload product images.');
    }
  };

  if (editing && productQuery.isLoading) return <FormSkeleton fields={7} />;
  if (editing && (productQuery.isError || !productQuery.data)) return <ErrorState message="Could not load product." onRetry={() => productQuery.refetch()} />;
  const FormScrollView = embedded ? SheetScrollView : ScrollView;

  return (
    <View style={[embedded ? styles.embeddedScreen : styles.screen, { backgroundColor: colors.background }]}>
      {embedded ? <View style={[styles.embeddedHeader, { borderBottomColor: colors.cardBorder }]}><Text style={[styles.embeddedTitle, { color: colors.text }]}>Create product</Text><Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close create product"><X color={colors.textSecondary} size={21} /></Pressable></View> : <ScreenHeader title={editing ? 'Edit product' : 'Create product'} onBack={() => navigation.goBack()} />}
      <FormScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <AppCard>
          <Text style={[styles.variantTitle, { color: colors.text }]}>Product gallery</Text>
          <View style={styles.gallery}>
            {images.map((item, index) => <View key={`${item.uri}-${index}`} style={styles.galleryItem}><Image source={{ uri: item.uri }} style={styles.galleryImage} contentFit="cover" /><Pressable onPress={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={[styles.removeImage, { backgroundColor: colors.surface }]} accessibilityLabel="Remove product image"><X color={colors.error} size={14} /></Pressable></View>)}
            {images.length < 8 ? <AppButton variant="secondary" label={images.length ? 'Add images' : 'Add image'} onPress={() => void pickImages()} /> : null}
          </View>
        </AppCard>
        <AppCard>
          <View style={styles.fields}>
            <AppTextField label="Product name" value={form.name} onChangeText={updateField('name')} placeholder="e.g. Blue T-shirt" />
            <AppTextField label="SKU" value={form.sku} onChangeText={updateField('sku')} placeholder="Optional SKU" />
            <AppTextField label="Category" value={form.category} onChangeText={(value) => setForm((current) => ({ ...current, category: value, categoryId: categoriesQuery.data?.items.find((item) => item.name.toLowerCase() === value.trim().toLowerCase())?.id ?? '' }))} placeholder="Optional category" />
            {(categoriesQuery.data?.items ?? []).length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>{categoriesQuery.data?.items.map((category) => <Pressable key={category.id} onPress={() => setForm((current) => ({ ...current, category: category.name, categoryId: category.id }))} style={[styles.categoryChip, { borderColor: form.categoryId === category.id ? colors.primary : colors.cardBorder, backgroundColor: form.categoryId === category.id ? colors.primarySoft : colors.surface }]}><Text style={{ color: colors.text }}>{category.name}</Text></Pressable>)}</ScrollView> : null}
            <View style={styles.categoryAdd}><AppTextField label="Add a category" value={newCategory} onChangeText={setNewCategory} placeholder="Category name" /><AppButton icon={Plus} label="Add" variant="secondary" disabled={!newCategory.trim()} onPress={() => void addCategory()} /></View>
            <AppTextField label="Currency" value={form.currency} onChangeText={updateField('currency')} placeholder="USD" autoCapitalize="characters" />
            <AppTextField label="Price" value={form.price} onChangeText={updateField('price')} placeholder="0.00" keyboardType="decimal-pad" />
            <AppTextField label="Sale price" value={form.salePrice} onChangeText={updateField('salePrice')} placeholder="Optional sale price" keyboardType="decimal-pad" />
            <AppTextField label="Weight (kg)" value={form.weight} onChangeText={updateField('weight')} placeholder="0.05" keyboardType="decimal-pad" />
            <View style={styles.dimensionRow}>
              <AppTextField label="Length (cm)" value={form.dimensionL} onChangeText={updateField('dimensionL')} placeholder="L" keyboardType="decimal-pad" style={styles.dimensionField} />
              <AppTextField label="Width (cm)" value={form.dimensionW} onChangeText={updateField('dimensionW')} placeholder="W" keyboardType="decimal-pad" style={styles.dimensionField} />
              <AppTextField label="Height (cm)" value={form.dimensionH} onChangeText={updateField('dimensionH')} placeholder="H" keyboardType="decimal-pad" style={styles.dimensionField} />
            </View>
            <AppTextField label="Inventory" value={form.inventory} onChangeText={updateField('inventory')} placeholder="Optional quantity" keyboardType="numeric" />
            <AppTextField label="Stock alert" value={form.stockAlert} onChangeText={updateField('stockAlert')} placeholder="Optional threshold" keyboardType="numeric" />
            <AppTextField label="Description" value={form.description} onChangeText={updateField('description')} placeholder="Describe this product" multiline numberOfLines={5} />
            <View style={styles.variantSection}>
              <Text style={[styles.variantTitle, { color: colors.text }]}>Variants</Text>
              {form.attributes.map((attribute, index) => (
                <View key={`${index}-${attribute.name}`} style={styles.attributeRow}>
                  <AppTextField label="Attribute" value={attribute.name} onChangeText={(value) => setForm((current) => ({ ...current, attributes: current.attributes.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item) }))} placeholder="Size" style={styles.attributeField} />
                  <AppTextField label="Values" value={attribute.values} onChangeText={(value) => setForm((current) => ({ ...current, attributes: current.attributes.map((item, itemIndex) => itemIndex === index ? { ...item, values: value } : item) }))} placeholder="S, M, L" style={styles.attributeField} />
                  <Pressable onPress={() => setForm((current) => ({ ...current, attributes: current.attributes.filter((_, itemIndex) => itemIndex !== index) }))} hitSlop={8}><X color={colors.error} size={18} /></Pressable>
                </View>
              ))}
              <AppButton variant="secondary" icon={Plus} label="Add attribute" onPress={() => setForm((current) => ({ ...current, attributes: [...current.attributes, { name: '', values: '' }] }))} />
            </View>
            <Pressable style={styles.statusRow} onPress={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}>
              {form.isActive ? <Check color={colors.success} size={18} /> : <X color={colors.textMuted} size={18} />}
              <Text style={{ color: colors.text }}>{form.isActive ? 'Active product' : 'Inactive product'}</Text>
            </Pressable>
          </View>
          <AppCard>
            <View style={styles.variantSection}>
              <Text style={[styles.variantTitle, { color: colors.text }]}>Sell on connected WhatsApp catalogs</Text>
              <Text style={{ color: colors.textSecondary }}>Choose catalogs where this product should be published.</Text>
              {channelsQuery.isLoading || catalogQueries.some((query) => query.isLoading) ? <Text style={{ color: colors.textSecondary }}>Checking connected catalogs…</Text> : catalogOptions.length ? catalogOptions.map((catalog) => {
                const enabled = selectedCatalogs.some((item) => item.channelId === catalog.channelId && item.catalogId === catalog.catalogId);
                return <Pressable key={catalog.channelId} onPress={() => setSelectedCatalogs((current) => enabled ? current.filter((item) => item.channelId !== catalog.channelId) : [...current, { channelId: catalog.channelId, catalogId: catalog.catalogId }])} style={[styles.catalogRow, { borderColor: enabled ? colors.success : colors.cardBorder, backgroundColor: enabled ? colors.successSoft : colors.surface }]}><Store color={enabled ? colors.success : colors.textMuted} size={18} /><View style={styles.catalogCopy}><Text style={{ color: colors.text, fontWeight: '600' }}>{catalog.catalogName}</Text><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{catalog.channelName}</Text></View>{enabled ? <Check color={colors.success} size={18} /> : null}</Pressable>;
              }) : <Text style={{ color: colors.textSecondary }}>No connected WhatsApp catalogs found.</Text>}
            </View>
          </AppCard>
          {error ? <ErrorState message={error} /> : null}
          <AppButton block icon={Save} label={mutation.isPending ? 'Saving...' : editing ? 'Save product' : 'Create product'} loading={mutation.isPending} disabled={!form.name.trim() || mutation.isPending || (channelsQuery.isLoading || catalogQueries.some((query) => query.isLoading))} onPress={() => { setError(null); mutation.mutate(); }} style={styles.save} />
        </AppCard>
      </FormScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  embeddedScreen: { flex: 1, minHeight: 0 },
  embeddedHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  embeddedTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: spacing.lg },
  fields: { gap: spacing.md },
  dimensionRow: { flexDirection: 'row', gap: spacing.sm },
  dimensionField: { flex: 1 },
  variantSection: { gap: spacing.sm },
  categoryList: { gap: spacing.sm },
  categoryChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  categoryAdd: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  catalogRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  catalogCopy: { flex: 1 },
  variantTitle: { fontSize: 15, fontWeight: '700' },
  attributeRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  attributeField: { flex: 1 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  galleryItem: { height: 76, position: 'relative', width: 76 },
  galleryImage: { borderRadius: 10, height: 76, width: 76 },
  removeImage: { alignItems: 'center', borderRadius: 999, height: 24, justifyContent: 'center', position: 'absolute', right: -5, top: -5, width: 24 },
  save: { marginTop: spacing.lg },
});
