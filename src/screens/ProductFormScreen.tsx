import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Check, ImagePlus, Layers3, Plus, RefreshCw, Save, Store, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createProduct, createProductDraft, fetchProduct, finalizeProductDraft, updateProduct, updateProductDraft, type ProductInput, type ProductResponse } from '../api/products';
import { fetchChannels, fetchWhatsappProductCatalog } from '../api/channels';
import { createProductCategory, fetchProductCategories } from '../api/productCategories';
import { uploadFile } from '../api/client';
import { ErrorState } from '../components/ErrorState';
import { SheetScrollView } from '../components/BottomSheet';
import { FormSkeleton } from '../components/Skeleton';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard, AppText, AppTextField, ScreenHeader } from '../ui';

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
  hasVariants: boolean;
  attributes: Array<{ name: string; values: string }>;
  variantOverrides: Record<string, { sku: string; price: string; salePrice: string; stock: string; weight: string; isActive: boolean }>;
};
type FormField = keyof FormState;
type FormErrors = Partial<Record<FormField, string>>;

const EMPTY_FORM: FormState = {
  name: '', sku: '', category: '', categoryId: '', price: '', salePrice: '', inventory: '1', stockAlert: '10', description: '', currency: 'BDT', weight: '0.05', dimensionL: '', dimensionW: '', dimensionH: '', isActive: true, hasVariants: false, attributes: [], variantOverrides: {},
};

function variantKey(attributes: Array<{ name: string; value: string }>) {
  return attributes.map(({ name, value }) => `${name.trim().toLowerCase()}=${value.trim()}`).join('|');
}

function generateProductSku() {
  const bytes = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));
  return `SKU-${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function buildProductVariants(form: FormState) {
  if (!form.hasVariants) return [];
  const attributes = form.attributes.map(({ name, values }) => ({ name: name.trim(), values: [...new Set(values.split(',').map((value) => value.trim()).filter(Boolean))] })).filter(({ name, values }) => name && values.length);
  if (!attributes.length) return [];
  const combinations = attributes.reduce<Array<Array<{ name: string; value: string }>>>((rows, attribute) => rows.length ? rows.flatMap((row) => attribute.values.map((value) => [...row, { name: attribute.name, value }])) : attribute.values.map((value) => [{ name: attribute.name, value }]), []);
  return combinations.slice(0, 500).map((combination) => {
    const suffix = combination.map(({ value }) => value.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase()).filter(Boolean).join('-');
    const override = form.variantOverrides[variantKey(combination)];
    return { sku: override?.sku || [form.sku.trim(), suffix].filter(Boolean).join('-'), basePrice: override?.price || form.price.trim() || undefined, salePrice: override?.salePrice || form.salePrice.trim() || undefined, stock: override?.stock !== undefined && override.stock !== '' ? Number(override.stock) : Number(form.inventory) || 0, weight: override?.weight || form.weight.trim() || undefined, isActive: override?.isActive ?? true, attributes: combination };
  });
}

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
    hasVariants: product.hasVariants,
    attributes: (() => {
      const grouped = new Map<string, Set<string>>();
      product.variants.forEach((variant) => variant.attributes.forEach(({ attributeName, value }) => { const values = grouped.get(attributeName) ?? new Set<string>(); values.add(value); grouped.set(attributeName, values); }));
      if (grouped.size) return [...grouped].map(([name, values]) => ({ name, values: [...values].join(', ') }));
      return Array.isArray(product.attributes) ? product.attributes.filter((item): item is { name: string; values: string } => typeof item === 'object' && item !== null && 'name' in item && 'values' in item).map((item) => ({ name: String(item.name), values: String(item.values) })) : [];
    })(),
    variantOverrides: Object.fromEntries(product.variants.map((variant) => {
      const attributes = variant.attributes.map(({ attributeName, value }) => ({ name: attributeName, value }));
      return [variantKey(attributes), { sku: variant.sku ?? '', price: variant.priceMinor === null ? '' : (variant.priceMinor / 100).toFixed(2), salePrice: variant.salePriceMinor === null ? '' : (variant.salePriceMinor / 100).toFixed(2), stock: variant.inventory === null ? '' : String(variant.inventory), weight: variant.weightGrams === null ? '' : String(variant.weightGrams / 1000), isActive: variant.isActive }];
    })),
  };
}

export function ProductFormScreen({ embedded = false, onSaved }: { embedded?: boolean; onSaved?: () => void }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SettingsStackParamList, 'ProductForm'>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { workspace } = useWorkspaceAccess();
  const productId = embedded ? undefined : route.params?.productId;
  const editing = Boolean(productId);
  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY_FORM, sku: generateProductSku(), currency: workspace?.defaultCurrency ?? EMPTY_FORM.currency }));
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const draftIdRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSavePromiseRef = useRef<Promise<void> | null>(null);
  const catalogSelectionInitializedRef = useRef(false);
  const currencyEditedRef = useRef(false);
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
  const catalogsReady = !channelsQuery.isLoading && catalogQueries.every((query) => !query.isLoading);
  useEffect(() => {
    if (productQuery.data) {
      setForm(productToForm(productQuery.data));
      setImages((productQuery.data.imageUrls ?? []).map((imageUrl) => ({ uri: imageUrl, imageUrl })));
      setSelectedCatalogs(productQuery.data.salesChannels.flatMap((item) => item.catalogId ? [{ channelId: item.channelId, catalogId: item.catalogId }] : []));
      catalogSelectionInitializedRef.current = true;
    }
  }, [productQuery.data]);

  useEffect(() => {
    if (editing || !workspace?.defaultCurrency || currencyEditedRef.current || form.name.trim()) return;
    setForm((current) => current.currency === EMPTY_FORM.currency ? { ...current, currency: workspace.defaultCurrency as string } : current);
  }, [editing, form.name, workspace?.defaultCurrency]);

  useEffect(() => {
    if (editing || !catalogsReady || catalogSelectionInitializedRef.current) return;
    setSelectedCatalogs(catalogOptions.map(({ channelId, catalogId }) => ({ channelId, catalogId })));
    catalogSelectionInitializedRef.current = true;
  }, [catalogOptions, catalogsReady, editing]);

  useEffect(() => {
    if (editing || !form.name.trim()) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    const snapshot = form;
    draftTimerRef.current = setTimeout(() => {
      setDraftStatus('saving');
      const draftPayload = {
        name: snapshot.name.trim(), sku: snapshot.sku.trim() || undefined, category: snapshot.category.trim() || undefined,
        categoryId: snapshot.categoryId || undefined, basePrice: snapshot.price.trim() || undefined,
        salePrice: snapshot.salePrice.trim() || undefined, initialStock: snapshot.inventory.trim() ? Number(snapshot.inventory) : undefined,
        stockAlert: snapshot.stockAlert.trim() ? Number(snapshot.stockAlert) : undefined, description: snapshot.description.trim() || undefined,
        currency: snapshot.currency.trim() || undefined, weight: snapshot.weight.trim() || undefined, dimensionL: snapshot.dimensionL.trim() || undefined,
        dimensionW: snapshot.dimensionW.trim() || undefined, dimensionH: snapshot.dimensionH.trim() || undefined,
        attributes: snapshot.attributes.filter((item) => item.name.trim() && item.values.trim()), hasVariants: snapshot.hasVariants,
        variants: buildProductVariants(snapshot), imageUrls: images.flatMap((image) => image.imageUrl ? [image.imageUrl] : []),
        imageAttachmentIds: images.flatMap((image) => image.attachmentId ? [image.attachmentId] : []),
      };
      const save = async () => {
        const saved = draftIdRef.current
          ? await updateProductDraft(draftIdRef.current, draftPayload)
          : await createProductDraft(draftPayload);
        draftIdRef.current = saved.id;
      };
      draftSavePromiseRef.current = (draftSavePromiseRef.current ?? Promise.resolve()).then(save).then(() => setDraftStatus('saved')).catch(() => setDraftStatus('error'));
    }, 1200);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [editing, form, images, selectedCatalogs]);

  const updateField = (key: FormField) => (value: string) => {
    if (key === 'currency') currencyEditedRef.current = true;
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };
  const validateForm = () => {
    const errors: FormErrors = {};
    const decimal = /^\d+(\.\d{1,2})?$/;
    if (!form.name.trim()) errors.name = 'Product name is required.';
    if (!form.categoryId) errors.categoryId = 'Select or create a category.';
    if (!form.sku.trim()) errors.sku = 'Base SKU is required.';
    const variants = buildProductVariants(form);
    if (form.hasVariants && !variants.length) errors.attributes = 'Add at least one variant attribute with values.';
    else if (variants.some((variant) => !variant.sku?.trim() || (variant.basePrice && !decimal.test(variant.basePrice)) || (variant.salePrice && !decimal.test(variant.salePrice)) || !Number.isInteger(variant.stock) || (variant.weight && !decimal.test(variant.weight)))) errors.attributes = 'Check each variant SKU, price, stock, and weight.';
    if (!form.inventory.trim() || !/^\d+$/.test(form.inventory.trim())) errors.inventory = 'Enter a whole number for initial stock.';
    if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) errors.currency = 'Enter a 3-letter currency code.';
    if (!form.price.trim() || !decimal.test(form.price.trim())) errors.price = 'Enter a valid base price (up to 2 decimal places).';
    if (!form.weight.trim() || !decimal.test(form.weight.trim())) errors.weight = 'Enter a valid weight (up to 2 decimal places).';
    if (form.salePrice.trim() && !decimal.test(form.salePrice.trim())) errors.salePrice = 'Enter a valid sale price (up to 2 decimal places).';
    if (form.stockAlert.trim() && !/^\d+$/.test(form.stockAlert.trim())) errors.stockAlert = 'Stock alert must be a whole number.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const saveProduct = () => {
    setError(null);
    if (!validateForm()) return;
    mutation.mutate();
  };
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
    hasVariants: form.hasVariants,
    variants: buildProductVariants(form),
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
      setFieldErrors((current) => ({ ...current, categoryId: undefined }));
      setNewCategory('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add category.'); }
  };
  const mutation = useMutation({
    mutationFn: async () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      await draftSavePromiseRef.current;
      const input = payload();
      if (editing) return updateProduct(productId as string, input);
      if (draftIdRef.current) {
        await updateProductDraft(draftIdRef.current, input);
        return finalizeProductDraft(draftIdRef.current, { isActive: form.isActive, whatsappCatalogs: selectedCatalogs });
      }
      return createProduct(input);
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

  const generatedVariants = buildProductVariants(form);
  if (editing && productQuery.isLoading) return <FormSkeleton fields={7} />;
  if (editing && (productQuery.isError || !productQuery.data)) return <ErrorState message="Could not load product." onRetry={() => productQuery.refetch()} />;
  const FormScrollView = embedded ? SheetScrollView : ScrollView;

  return (
    <View style={[embedded ? styles.embeddedScreen : styles.screen, { backgroundColor: colors.background }]}>
      {embedded ? <View style={[styles.embeddedHeader, { borderBottomColor: colors.cardBorder }]}><Text style={[styles.embeddedTitle, { color: colors.text }]}>Create product</Text></View> : <ScreenHeader title={editing ? 'Edit product' : 'Create product'} onBack={() => navigation.goBack()} />}
      <FormScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <AppCard padding="md">
          <View style={styles.galleryHeader}><View><AppText variant="section">Product photos</AppText><AppText variant="small" tone="secondary">Optional · Up to 8 images</AppText></View>{images.length ? <AppText variant="small" tone="secondary">{images.length}/8</AppText> : null}</View>
          {images.length ? <View style={styles.gallery}>
            {images.map((item, index) => <View key={`${item.uri}-${index}`} style={styles.galleryItem}><Image source={{ uri: item.uri }} style={styles.galleryImage} contentFit="cover" /><View style={[styles.imageIndex, { backgroundColor: colors.surface }]}><Text style={[styles.imageIndexText, { color: colors.textSecondary }]}>{index + 1}</Text></View><Pressable onPress={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={[styles.removeImage, { backgroundColor: colors.surface }]} accessibilityLabel="Remove product image"><X color={colors.error} size={14} /></Pressable></View>)}
            {images.length < 8 ? <Pressable onPress={() => void pickImages()} style={[styles.addImageTile, { borderColor: colors.cardBorder, backgroundColor: colors.background }]} accessibilityLabel="Add product images"><ImagePlus color={colors.primary} size={21} /><Text style={[styles.addImageText, { color: colors.primary }]}>Add</Text></Pressable> : null}
          </View> : <Pressable onPress={() => void pickImages()} style={[styles.uploadZone, { borderColor: colors.cardBorder, backgroundColor: colors.background }]} accessibilityRole="button" accessibilityLabel="Choose product images">
            <View style={[styles.uploadIcon, { backgroundColor: colors.primarySoft }]}><ImagePlus color={colors.primary} size={23} /></View>
            <Text style={[styles.uploadTitle, { color: colors.text }]}>Add product photos</Text>
            <Text style={[styles.uploadHint, { color: colors.textSecondary }]}>Show customers what your product looks like</Text>
            <View style={[styles.uploadAction, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><Plus color={colors.primary} size={15} /><Text style={[styles.uploadActionText, { color: colors.primary }]}>Choose images</Text></View>
          </Pressable>}
        </AppCard>
        <AppCard>
          <View style={styles.fields}>
            <View style={styles.sectionIntro}><AppText variant="section">Product information</AppText><AppText variant="small" tone="secondary">Name, SKU and category</AppText></View>
            {!editing && form.name.trim() ? <Text style={[styles.draftStatus, { color: draftStatus === 'error' ? colors.error : draftStatus === 'saved' ? colors.success : colors.textSecondary }]}>{draftStatus === 'saving' ? 'Saving draft…' : draftStatus === 'saved' ? 'Draft saved · Nothing is published until you create the product.' : draftStatus === 'error' ? 'Draft could not be saved · Your current changes are still here.' : 'Draft mode · Your progress saves automatically.'}</Text> : null}
            <AppTextField label="Product name *" value={form.name} onChangeText={updateField('name')} placeholder="e.g. Blue T-shirt" error={fieldErrors.name} />
            <View style={styles.skuRow}><AppTextField label="Base SKU *" value={form.sku} onChangeText={updateField('sku')} placeholder="e.g. SHIRT-001" error={fieldErrors.sku} style={styles.skuInput} /><Pressable onPress={() => { setForm((current) => ({ ...current, sku: generateProductSku() })); setFieldErrors((current) => ({ ...current, sku: undefined })); }} style={[styles.skuGenerateButton, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} accessibilityRole="button" accessibilityLabel="Generate a new SKU"><RefreshCw color={colors.primary} size={18} /></Pressable></View>
            <AppTextField label="Category *" value={form.category} onChangeText={(value) => { setForm((current) => ({ ...current, category: value, categoryId: categoriesQuery.data?.items.find((item) => item.name.toLowerCase() === value.trim().toLowerCase())?.id ?? '' })); setFieldErrors((current) => ({ ...current, categoryId: undefined })); }} placeholder="Select or create a category" error={fieldErrors.categoryId} />
            {(categoriesQuery.data?.items ?? []).length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>{categoriesQuery.data?.items.map((category) => <Pressable key={category.id} onPress={() => { setForm((current) => ({ ...current, category: category.name, categoryId: category.id })); setFieldErrors((current) => ({ ...current, categoryId: undefined })); }} style={[styles.categoryChip, { borderColor: form.categoryId === category.id ? colors.primary : colors.cardBorder, backgroundColor: form.categoryId === category.id ? colors.primarySoft : colors.surface }]}><Text style={{ color: colors.text }}>{category.name}</Text></Pressable>)}</ScrollView> : null}
            <View style={styles.categoryAdd}><AppTextField label="Add a category" value={newCategory} onChangeText={setNewCategory} placeholder="Category name" style={styles.categoryField} /><AppButton icon={Plus} label="Add" variant="secondary" disabled={!newCategory.trim()} onPress={() => void addCategory()} /></View>
          </View>
        </AppCard>
        <AppCard padding="md">
          <View style={styles.fields}>
            <View style={styles.sectionIntro}><AppText variant="section">Pricing and shipping</AppText><AppText variant="small" tone="secondary">Set your prices and product measurements</AppText></View>
            <View style={styles.priceRow}>
              <AppTextField label="Currency *" value={form.currency} onChangeText={updateField('currency')} placeholder="BDT" autoCapitalize="characters" error={fieldErrors.currency} style={styles.currencyField} />
              <AppTextField label="Base price *" value={form.price} onChangeText={updateField('price')} placeholder="0.00" keyboardType="decimal-pad" error={fieldErrors.price} style={styles.priceField} />
            </View>
            <AppTextField label="Sale price" value={form.salePrice} onChangeText={updateField('salePrice')} placeholder="Optional sale price" keyboardType="decimal-pad" error={fieldErrors.salePrice} />
            <AppTextField label="Weight (kg) *" value={form.weight} onChangeText={updateField('weight')} placeholder="0.05" keyboardType="decimal-pad" error={fieldErrors.weight} />
            <View style={styles.dimensionRow}>
              <AppTextField label="Length (cm)" value={form.dimensionL} onChangeText={updateField('dimensionL')} placeholder="L" keyboardType="decimal-pad" style={styles.dimensionField} />
              <AppTextField label="Width (cm)" value={form.dimensionW} onChangeText={updateField('dimensionW')} placeholder="W" keyboardType="decimal-pad" style={styles.dimensionField} />
              <AppTextField label="Height (cm)" value={form.dimensionH} onChangeText={updateField('dimensionH')} placeholder="H" keyboardType="decimal-pad" style={styles.dimensionField} />
            </View>
          </View>
        </AppCard>
        <AppCard padding="md">
          <View style={styles.fields}>
            <View style={styles.sectionIntro}><AppText variant="section">Inventory and details</AppText><AppText variant="small" tone="secondary">Manage stock and add more product information</AppText></View>
            <View style={styles.stockRow}>
              <AppTextField label="Initial stock *" value={form.inventory} onChangeText={updateField('inventory')} placeholder="1" keyboardType="numeric" error={fieldErrors.inventory} style={styles.stockField} />
              <AppTextField label="Stock alert" value={form.stockAlert} onChangeText={updateField('stockAlert')} placeholder="10" keyboardType="numeric" error={fieldErrors.stockAlert} style={styles.stockField} />
            </View>
            <AppTextField label="Description" value={form.description} onChangeText={updateField('description')} placeholder="Describe this product" multiline numberOfLines={5} />
            <View style={styles.variantSection}>
              <View style={styles.variantHeading}><View style={styles.variantHeadingCopy}><Layers3 color={colors.primary} size={18} /><Text style={[styles.variantTitle, { color: colors.text }]}>Variants</Text></View><View style={[styles.variantMode, { backgroundColor: colors.surfaceSecondary }]}><Pressable onPress={() => setForm((current) => ({ ...current, hasVariants: false }))} style={[styles.variantModeButton, !form.hasVariants && { backgroundColor: colors.surface }]}><Text style={[styles.variantModeLabel, { color: !form.hasVariants ? colors.text : colors.textSecondary }]}>Simple</Text></Pressable><Pressable onPress={() => setForm((current) => ({ ...current, hasVariants: true }))} style={[styles.variantModeButton, form.hasVariants && { backgroundColor: colors.primarySoft }]}><Text style={[styles.variantModeLabel, { color: form.hasVariants ? colors.primary : colors.textSecondary }]}>Variants</Text></Pressable></View></View>
              <AppText variant="small" tone="secondary">Generate options like sizes or colors. Each combination gets its own SKU, price, and stock.</AppText>
              {form.hasVariants ? <>
              {form.attributes.map((attribute, index) => (
                <View key={`${index}-${attribute.name}`} style={styles.attributeRow}>
                  <AppTextField label="Attribute" value={attribute.name} onChangeText={(value) => setForm((current) => ({ ...current, attributes: current.attributes.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item) }))} placeholder="Size" style={styles.attributeField} />
                  <AppTextField label="Values" value={attribute.values} onChangeText={(value) => setForm((current) => ({ ...current, attributes: current.attributes.map((item, itemIndex) => itemIndex === index ? { ...item, values: value } : item) }))} placeholder="S, M, L" style={styles.attributeField} />
                  <Pressable onPress={() => setForm((current) => ({ ...current, attributes: current.attributes.filter((_, itemIndex) => itemIndex !== index) }))} hitSlop={8}><X color={colors.error} size={18} /></Pressable>
                </View>
              ))}
              <AppButton variant="secondary" icon={Plus} label="Add attribute" onPress={() => setForm((current) => ({ ...current, attributes: [...current.attributes, { name: '', values: '' }] }))} />
              {fieldErrors.attributes ? <Text style={[styles.variantError, { color: colors.error }]}>{fieldErrors.attributes}</Text> : null}
              {generatedVariants.length ? <>
                <View style={[styles.variantPreview, { backgroundColor: colors.surfaceSecondary }]}><Text style={[styles.variantPreviewTitle, { color: colors.text }]}>{generatedVariants.length} variant{generatedVariants.length === 1 ? '' : 's'} generated · edit SKU, price, stock, and weight below</Text></View>
                {generatedVariants.map((variant) => {
                  const key = variantKey(variant.attributes);
                  const current = form.variantOverrides[key] ?? { sku: variant.sku ?? '', price: variant.basePrice ?? '', salePrice: variant.salePrice ?? '', stock: String(variant.stock ?? ''), weight: variant.weight ?? '', isActive: variant.isActive ?? true };
                  const updateVariant = (field: keyof typeof current, value: string) => setForm((state) => ({ ...state, variantOverrides: { ...state.variantOverrides, [key]: { ...(state.variantOverrides[key] ?? current), [field]: value } } }));
                  return <View key={key} style={[styles.variantItem, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}>
                    <Text style={[styles.variantItemName, { color: colors.text }]}>{variant.attributes.map(({ name, value }) => `${name}: ${value}`).join(' · ')}</Text>
                    <TextInput value={current.sku} onChangeText={(value) => updateVariant('sku', value)} placeholder="Variant SKU" placeholderTextColor={colors.textMuted} style={[styles.variantInput, { borderColor: colors.cardBorder, color: colors.text }]} autoCapitalize="characters" accessibilityLabel="Variant SKU" />
                    <View style={styles.variantValuesRow}>
                      <TextInput value={current.price} onChangeText={(value) => updateVariant('price', value)} placeholder="Base price" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text }]} accessibilityLabel="Variant base price" />
                      <TextInput value={current.salePrice} onChangeText={(value) => updateVariant('salePrice', value)} placeholder="Sale price" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text }]} accessibilityLabel="Variant sale price" />
                    </View>
                    <Pressable onPress={() => setForm((state) => ({ ...state, variantOverrides: { ...state.variantOverrides, [key]: { ...(state.variantOverrides[key] ?? current), isActive: !current.isActive } } }))} style={styles.variantStatusRow}><View style={[styles.variantStatusDot, { backgroundColor: current.isActive ? colors.success : colors.textMuted }]} /><Text style={[styles.variantStatusText, { color: current.isActive ? colors.success : colors.textSecondary }]}>{current.isActive ? 'Variant active' : 'Variant inactive'}</Text></Pressable>
                    <View style={styles.variantValuesRow}>
                      <TextInput value={current.stock} onChangeText={(value) => updateVariant('stock', value)} placeholder="Stock" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text }]} accessibilityLabel="Variant stock" />
                      <TextInput value={current.weight} onChangeText={(value) => updateVariant('weight', value)} placeholder="Weight (kg)" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text }]} accessibilityLabel="Variant weight" />
                    </View>
                  </View>;
                })}
              </> : null}
              </> : <Text style={[styles.simpleProductHint, { color: colors.textSecondary }]}>This product will use one SKU and the stock and price above.</Text>}
            </View>
            <Pressable style={styles.statusRow} onPress={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}>
              {form.isActive ? <Check color={colors.success} size={18} /> : <X color={colors.textMuted} size={18} />}
              <Text style={{ color: colors.text }}>{form.isActive ? 'Active product' : 'Inactive product'}</Text>
            </Pressable>
          </View>
        </AppCard>
        <AppCard padding="md">
          <View style={styles.variantSection}>
              <View style={styles.sectionIntro}><AppText variant="section">Sales channels</AppText><AppText variant="small" tone="secondary">Choose WhatsApp catalogs where this product can be published.</AppText></View>
              {channelsQuery.isLoading || catalogQueries.some((query) => query.isLoading) ? <Text style={{ color: colors.textSecondary }}>Checking connected catalogs…</Text> : catalogOptions.length ? catalogOptions.map((catalog) => {
                const enabled = selectedCatalogs.some((item) => item.channelId === catalog.channelId && item.catalogId === catalog.catalogId);
                return <Pressable key={catalog.channelId} onPress={() => setSelectedCatalogs((current) => enabled ? current.filter((item) => item.channelId !== catalog.channelId) : [...current, { channelId: catalog.channelId, catalogId: catalog.catalogId }])} style={[styles.catalogRow, { borderColor: enabled ? colors.success : colors.cardBorder, backgroundColor: enabled ? colors.successSoft : colors.surface }]}><Store color={enabled ? colors.success : colors.textMuted} size={18} /><View style={styles.catalogCopy}><Text style={{ color: colors.text, fontWeight: '600' }}>{catalog.catalogName}</Text><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{catalog.channelName}</Text></View>{enabled ? <Check color={colors.success} size={18} /> : null}</Pressable>;
              }) : <Text style={{ color: colors.textSecondary }}>No connected WhatsApp catalogs found.</Text>}
          </View>
        </AppCard>
        {error ? <ErrorState message={error} /> : null}
        <AppButton block icon={Save} label={mutation.isPending ? 'Saving...' : editing ? 'Save product' : 'Create product'} loading={mutation.isPending} disabled={mutation.isPending || !catalogsReady} onPress={saveProduct} style={styles.save} />
      </FormScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  embeddedScreen: { flex: 1, minHeight: 0 },
  embeddedHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  embeddedTitle: { fontSize: 18, fontWeight: '800' },
  content: { gap: spacing.md, padding: spacing.lg },
  fields: { gap: spacing.md },
  draftStatus: { fontSize: fontSize.tiny, lineHeight: 16 },
  sectionIntro: { gap: spacing.xs, paddingBottom: spacing.xs },
  priceRow: { flexDirection: 'row', gap: spacing.sm },
  currencyField: { flex: 0.8 },
  priceField: { flex: 1.2 },
  stockRow: { flexDirection: 'row', gap: spacing.sm },
  stockField: { flex: 1 },
  dimensionRow: { flexDirection: 'row', gap: spacing.sm },
  dimensionField: { flex: 1 },
  variantSection: { gap: spacing.sm },
  categoryList: { gap: spacing.sm },
  categoryChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  categoryAdd: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  skuRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  skuInput: { flex: 1 },
  skuGenerateButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, height: 48, justifyContent: 'center', marginBottom: 3, width: 48 },
  categoryField: { flex: 1 },
  catalogRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  catalogCopy: { flex: 1 },
  variantTitle: { fontSize: 15, fontWeight: '700' },
  variantHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  variantHeadingCopy: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  variantMode: { borderRadius: radius.pill, flexDirection: 'row', padding: 3 },
  variantModeButton: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  variantModeLabel: { fontSize: fontSize.tiny, fontWeight: fontWeight.semibold },
  variantPreview: { borderRadius: radius.md, gap: spacing.xs, padding: spacing.md },
  variantPreviewTitle: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  variantItem: { borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  variantItemName: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  variantValuesRow: { flexDirection: 'row', gap: spacing.sm },
  variantInput: { borderRadius: radius.sm, borderWidth: 1, fontSize: fontSize.small, height: 40, paddingHorizontal: spacing.sm },
  variantValueInput: { flex: 1, minWidth: 0 },
  variantStatusRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs },
  variantStatusDot: { borderRadius: radius.pill, height: 7, width: 7 },
  variantStatusText: { fontSize: fontSize.tiny, fontWeight: fontWeight.medium },
  variantError: { fontSize: fontSize.small },
  simpleProductHint: { fontSize: fontSize.small },
  attributeRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  attributeField: { flex: 1 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  galleryHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  galleryItem: { height: 82, position: 'relative', width: 82 },
  galleryImage: { borderRadius: radius.md, height: 82, width: 82 },
  imageIndex: { alignItems: 'center', borderRadius: radius.pill, bottom: 5, height: 20, justifyContent: 'center', left: 5, position: 'absolute', width: 20 },
  imageIndexText: { fontSize: 10, fontWeight: '700' },
  removeImage: { alignItems: 'center', borderRadius: 999, height: 24, justifyContent: 'center', position: 'absolute', right: -5, top: -5, width: 24 },
  addImageTile: { alignItems: 'center', borderRadius: radius.md, borderStyle: 'dashed', borderWidth: 1, height: 82, justifyContent: 'center', width: 82 },
  addImageText: { fontSize: fontSize.tiny, fontWeight: fontWeight.bold, marginTop: 3 },
  uploadZone: { alignItems: 'center', borderRadius: radius.lg, borderStyle: 'dashed', borderWidth: 1.5, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xl },
  uploadIcon: { alignItems: 'center', borderRadius: radius.lg, height: 48, justifyContent: 'center', width: 48 },
  uploadTitle: { fontSize: fontSize.body, fontWeight: fontWeight.bold, marginTop: spacing.sm },
  uploadHint: { fontSize: fontSize.small, marginTop: spacing.xs, textAlign: 'center' },
  uploadAction: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  uploadActionText: { fontSize: fontSize.small, fontWeight: fontWeight.bold },
  save: { marginTop: spacing.lg },
});
