import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Check, ImagePlus, Info, Layers3, Plus, RefreshCw, Save, Sparkles, Store, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createProduct, createProductDraft, fetchProduct, fetchProductVariationAttributes, finalizeProductDraft, updateProduct, updateProductDraft, type ProductInput, type ProductResponse } from '../api/products';
import { fetchChannels, fetchWhatsappProductCatalog } from '../api/channels';
import { createProductCategory, fetchProductCategories } from '../api/productCategories';
import { uploadFile } from '../api/client';
import { ErrorState } from '../components/ErrorState';
import { ChannelLogo } from '../components/ChannelLogo';
import { FormSkeleton } from '../components/Skeleton';
import { MarkdownDescriptionEditor } from '../components/MarkdownDescriptionEditor';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { sanitizeMoneyInput } from '../lib/numeric-input';
import { fontSize, fontWeight, inputHeightDense, radius, spacing } from '../theme/tokens';
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

const QUICK_VARIATION_ATTRIBUTES = ['SCENT', 'COLOR', 'CONCENTRATION'];
const MAX_PRODUCT_VARIANTS = 500;

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
  return combinations.slice(0, MAX_PRODUCT_VARIANTS).map((combination) => {
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

export function ProductFormScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SettingsStackParamList, 'ProductForm'>>();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const { workspace } = useWorkspaceAccess();
  const productId = route.params?.productId;
  const editing = Boolean(productId);
  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY_FORM, sku: generateProductSku(), currency: workspace?.defaultCurrency ?? EMPTY_FORM.currency }));
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryCreating, setCategoryCreating] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const draftIdRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSavePromiseRef = useRef<Promise<void> | null>(null);
  const catalogSelectionInitializedRef = useRef(false);
  const currencyEditedRef = useRef(false);
  const [images, setImages] = useState<Array<{ uri: string; imageUrl?: string; attachmentId?: string }>>([]);
  const [newCategory, setNewCategory] = useState('');
  const [selectedCatalogs, setSelectedCatalogs] = useState<Array<{ channelId: string; catalogId: string }>>([]);
  const [bulkVariantValues, setBulkVariantValues] = useState({ price: '', salePrice: '', stock: '', weight: '' });
  const [variantValueDrafts, setVariantValueDrafts] = useState<Record<string, string>>({});
  const channelsQuery = useQuery({ queryKey: ['channels'], queryFn: fetchChannels });
  const categoriesQuery = useQuery({ queryKey: ['product-categories'], queryFn: () => fetchProductCategories(workspace?.id), enabled: Boolean(workspace?.id) });
  const variationAttributesQuery = useQuery({ queryKey: ['products', 'variation-attributes'], queryFn: fetchProductVariationAttributes, staleTime: 5 * 60 * 1000 });
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
    const name = newCategory.trim();
    if (!name || categoryCreating) return;
    const existing = categoriesQuery.data?.items.find((item) => item.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setForm((current) => ({ ...current, category: existing.name, categoryId: existing.id }));
      setFieldErrors((current) => ({ ...current, categoryId: undefined }));
      setNewCategory('');
      setCategoryError(null);
      return;
    }
    setCategoryCreating(true);
    setCategoryError(null);
    try {
      const category = await createProductCategory(name, workspace?.id);
      await queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      setForm((current) => ({ ...current, category: category.name, categoryId: category.id }));
      setFieldErrors((current) => ({ ...current, categoryId: undefined }));
      setNewCategory('');
    } catch (cause) { setCategoryError(cause instanceof Error ? cause.message : 'Could not add category.'); }
    finally { setCategoryCreating(false); }
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
      navigation.goBack();
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
  const generatedCombinationCount = form.hasVariants ? form.attributes.reduce((count, attribute) => {
    const valueCount = [...new Set(attribute.values.split(',').map((value) => value.trim()).filter(Boolean))].length;
    return count * (attribute.name.trim() && valueCount ? valueCount : 1);
  }, form.attributes.some((attribute) => attribute.name.trim() && attribute.values.trim()) ? 1 : 0) : 0;
  const addVariantAttribute = (name = '') => setForm((current) => current.attributes.some((attribute) => name && attribute.name.trim().toLowerCase() === name.toLowerCase()) ? current : { ...current, attributes: [...current.attributes, { name, values: '' }] });
  const addAttributeValues = (index: number, input: string) => {
    const incoming = input.split(',').map((value) => value.trim()).filter(Boolean);
    setForm((current) => ({ ...current, attributes: current.attributes.map((attribute, itemIndex) => {
      if (itemIndex !== index) return attribute;
      const existing = attribute.values.split(',').map((value) => value.trim()).filter(Boolean);
      const values = [...existing];
      incoming.forEach((value) => { if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) values.push(value); });
      return { ...attribute, values: values.join(', ') };
    }) }));
  };
  const applyBulkVariantValues = () => {
    if (!Object.values(bulkVariantValues).some((value) => value.trim())) return;
    setForm((current) => {
      const overrides = { ...current.variantOverrides };
      for (const variant of buildProductVariants(current)) {
        const key = variantKey(variant.attributes);
        const existing = overrides[key] ?? { sku: variant.sku ?? '', price: variant.basePrice ?? '', salePrice: variant.salePrice ?? '', stock: String(variant.stock ?? ''), weight: variant.weight ?? '', isActive: variant.isActive ?? true };
        overrides[key] = {
          ...existing,
          ...(bulkVariantValues.price.trim() ? { price: sanitizeMoneyInput(bulkVariantValues.price) } : {}),
          ...(bulkVariantValues.salePrice.trim() ? { salePrice: sanitizeMoneyInput(bulkVariantValues.salePrice) } : {}),
          ...(bulkVariantValues.stock.trim() ? { stock: bulkVariantValues.stock.replace(/\D/g, '') } : {}),
          ...(bulkVariantValues.weight.trim() ? { weight: sanitizeMoneyInput(bulkVariantValues.weight) } : {}),
        };
      }
      return { ...current, variantOverrides: overrides };
    });
  };
  if (editing && productQuery.isLoading) return <FormSkeleton fields={7} />;
  if (editing && (productQuery.isError || !productQuery.data)) return <ErrorState message="Could not load product." onRetry={() => productQuery.refetch()} />;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={editing ? 'Edit product' : 'Create product'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
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
            <AppTextField label="Product name" required value={form.name} onChangeText={updateField('name')} placeholder="e.g. Blue T-shirt" error={fieldErrors.name} />
            <View style={styles.skuRow}><AppTextField label="Base SKU" required value={form.sku} onChangeText={updateField('sku')} placeholder="e.g. SHIRT-001" error={fieldErrors.sku} style={styles.skuInput} /><Pressable onPress={() => { setForm((current) => ({ ...current, sku: generateProductSku() })); setFieldErrors((current) => ({ ...current, sku: undefined })); }} style={[styles.skuGenerateButton, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} accessibilityRole="button" accessibilityLabel="Generate a new SKU"><RefreshCw color={colors.primary} size={18} /></Pressable></View>
            <View style={styles.categoryPicker}>
              <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>Category <Text style={{ color: colors.error }}>*</Text></Text>
              {form.categoryId ? <View style={[styles.selectedCategory, { borderColor: colors.inputBorder, backgroundColor: colors.surface }]}>
                <View style={styles.selectedCategoryCopy}><View style={[styles.categoryDot, { backgroundColor: colors.textMuted }]} /><Text numberOfLines={1} style={[styles.selectedCategoryName, { color: colors.text }]}>{form.category}</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${form.category} category`} onPress={() => { setForm((current) => ({ ...current, category: '', categoryId: '' })); setFieldErrors((current) => ({ ...current, categoryId: undefined })); }} style={styles.clearCategory}><X color={colors.textMuted} size={17} /></Pressable>
              </View> : <AppTextField value={form.category} onChangeText={(value) => { setForm((current) => ({ ...current, category: value, categoryId: categoriesQuery.data?.items.find((item) => item.name.toLowerCase() === value.trim().toLowerCase())?.id ?? '' })); setFieldErrors((current) => ({ ...current, categoryId: undefined })); }} placeholder="Select or create a category" error={fieldErrors.categoryId} />}
            </View>
            {(categoriesQuery.data?.items ?? []).length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>{categoriesQuery.data?.items.map((category) => <Pressable key={category.id} onPress={() => { setForm((current) => ({ ...current, category: category.name, categoryId: category.id })); setFieldErrors((current) => ({ ...current, categoryId: undefined })); }} style={[styles.categoryChip, { borderColor: form.categoryId === category.id ? colors.primary : colors.cardBorder, backgroundColor: form.categoryId === category.id ? colors.primarySoft : colors.surface }]}><View style={[styles.categoryDot, { backgroundColor: form.categoryId === category.id ? colors.primary : colors.textMuted }]} /><Text style={[styles.categoryChipText, { color: form.categoryId === category.id ? colors.primary : colors.text }]}>{category.name}</Text></Pressable>)}</ScrollView> : null}
            <View style={styles.categoryAdd}><AppTextField label="Add a category" value={newCategory} onChangeText={(value) => { setNewCategory(value); setCategoryError(null); }} placeholder="Category name" style={styles.categoryField} returnKeyType="done" onSubmitEditing={() => void addCategory()} /><Pressable onPress={() => void addCategory()} disabled={!newCategory.trim() || categoryCreating} style={[styles.categoryAddButton, { backgroundColor: colors.primary, opacity: !newCategory.trim() || categoryCreating ? 0.55 : 1 }]} accessibilityRole="button" accessibilityLabel="Add product category" accessibilityState={{ disabled: !newCategory.trim() || categoryCreating }}>{categoryCreating ? <ActivityIndicator color={colors.primaryText} size="small" /> : <><Plus color={colors.primaryText} size={17} /><Text style={[styles.categoryAddButtonText, { color: colors.primaryText }]}>{categoryCreating ? 'Adding' : 'Add'}</Text></>}</Pressable></View>
            {categoryError ? <Text style={[styles.categoryError, { color: colors.error }]}>{categoryError}</Text> : null}
          </View>
        </AppCard>
        <AppCard padding="md">
          <View style={styles.fields}>
            <View style={styles.sectionIntro}><AppText variant="section">Pricing and shipping</AppText><AppText variant="small" tone="secondary">Set your prices and product measurements</AppText></View>
            <View style={styles.priceRow}>
              <AppTextField label="Currency" required value={form.currency} onChangeText={updateField('currency')} placeholder="BDT" autoCapitalize="characters" error={fieldErrors.currency} style={styles.currencyField} />
              <AppTextField label="Base price" required value={form.price} onChangeText={(value) => updateField('price')(sanitizeMoneyInput(value))} placeholder="0.00" keyboardType="decimal-pad" inputMode="decimal" error={fieldErrors.price} style={styles.priceField} />
            </View>
            <AppTextField label="Sale price" value={form.salePrice} onChangeText={(value) => updateField('salePrice')(sanitizeMoneyInput(value))} placeholder="Optional sale price" keyboardType="decimal-pad" inputMode="decimal" error={fieldErrors.salePrice} />
            <AppTextField label="Weight (kg)" required value={form.weight} onChangeText={updateField('weight')} placeholder="0.05" keyboardType="decimal-pad" error={fieldErrors.weight} />
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
              <AppTextField label="Initial stock" required value={form.inventory} onChangeText={updateField('inventory')} placeholder="1" keyboardType="numeric" error={fieldErrors.inventory} style={styles.stockField} />
              <AppTextField label="Stock alert" value={form.stockAlert} onChangeText={updateField('stockAlert')} placeholder="10" keyboardType="numeric" error={fieldErrors.stockAlert} style={styles.stockField} />
            </View>
            <View style={styles.descriptionField}>
              <AppText variant="small" tone="secondary">Description</AppText>
              <MarkdownDescriptionEditor value={form.description} onChange={updateField('description')} />
            </View>
            <View style={styles.variantSection}>
              <View style={styles.variantHeading}><View style={styles.variantHeadingCopy}><Layers3 color={colors.primary} size={18} /><Text style={[styles.variantTitle, { color: colors.text }]}>Variants</Text></View><View style={[styles.variantMode, { backgroundColor: colors.surfaceSecondary }]}><Pressable onPress={() => setForm((current) => ({ ...current, hasVariants: false }))} style={[styles.variantModeButton, !form.hasVariants && { backgroundColor: colors.surface }]}><Text style={[styles.variantModeLabel, { color: !form.hasVariants ? colors.text : colors.textSecondary }]}>Simple</Text></Pressable><Pressable onPress={() => setForm((current) => ({ ...current, hasVariants: true }))} style={[styles.variantModeButton, form.hasVariants && { backgroundColor: colors.primarySoft }]}><Text style={[styles.variantModeLabel, { color: form.hasVariants ? colors.primary : colors.textSecondary }]}>Variants</Text></Pressable></View></View>
              {form.hasVariants ? <>
              {form.attributes.map((attribute, index) => {
                const values = attribute.values.split(',').map((value) => value.trim()).filter(Boolean);
                const attributeDraftKey = `${index}-${attribute.name}`;
                const suggestedAttribute = variationAttributesQuery.data?.find((item) => item.name.trim().toLowerCase() === attribute.name.trim().toLowerCase());
                return <View key={index} style={[styles.attributeCard, { borderColor: colors.primary + '55', backgroundColor: colors.surfaceSecondary }]}>
                  <View style={styles.attributeHeaderRow}>
                    <AppTextField label="Attribute" value={attribute.name} onChangeText={(value) => setForm((current) => ({ ...current, attributes: current.attributes.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item) }))} placeholder="Size" autoCapitalize="words" style={styles.attributeField} />
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attribute.name || 'attribute'}`} onPress={() => setForm((current) => ({ ...current, attributes: current.attributes.filter((_, itemIndex) => itemIndex !== index) }))} style={[styles.removeAttributeButton, { borderColor: colors.error + '55', backgroundColor: colors.surface }]} hitSlop={6}><Trash2 color={colors.error} size={17} /></Pressable>
                  </View>
                  {attribute.name.trim() ? <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRow}>{(variationAttributesQuery.data ?? []).filter((item) => item.name.toLowerCase().includes(attribute.name.trim().toLowerCase())).slice(0, 6).map((item) => <Pressable key={item.id} onPress={() => setForm((current) => ({ ...current, attributes: current.attributes.map((value, itemIndex) => itemIndex === index ? { ...value, name: item.name.toUpperCase() } : value) }))} style={[styles.suggestionChip, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><Text style={[styles.suggestionText, { color: colors.textSecondary }]}>{item.name}</Text></Pressable>)}</ScrollView> : null}
                  <View style={[styles.valueEntry, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}>
                    {values.map((value) => <View key={value} style={[styles.valueChip, { backgroundColor: colors.primarySoft }]}><Text style={[styles.valueChipText, { color: colors.primary }]}>{value}</Text><Pressable onPress={() => setForm((current) => ({ ...current, attributes: current.attributes.map((item, itemIndex) => itemIndex === index ? { ...item, values: values.filter((entry) => entry !== value).join(', ') } : item) }))} accessibilityRole="button" accessibilityLabel={`Remove ${value}`} hitSlop={4}><X color={colors.primary} size={12} /></Pressable></View>)}
                    <TextInput value={variantValueDrafts[attributeDraftKey] ?? ''} onChangeText={(value) => {
                      if (value.includes(',')) {
                        const [committed, ...remaining] = value.split(',');
                        addAttributeValues(index, committed);
                        setVariantValueDrafts((current) => ({ ...current, [attributeDraftKey]: remaining.join(',') }));
                        return;
                      }
                      setVariantValueDrafts((current) => ({ ...current, [attributeDraftKey]: value }));
                    }} onSubmitEditing={() => { addAttributeValues(index, variantValueDrafts[attributeDraftKey] ?? ''); setVariantValueDrafts((current) => ({ ...current, [attributeDraftKey]: '' })); }} placeholder="Type a value and press Enter or comma" placeholderTextColor={colors.textMuted} style={[styles.valueEntryInput, { color: colors.text }]} returnKeyType="done" blurOnSubmit={false} accessibilityLabel={`Values for ${attribute.name || 'attribute'}`} />
                  </View>
                  {suggestedAttribute?.values.length ? <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRow}>{suggestedAttribute.values.filter((item) => !values.some((value) => value.toLowerCase() === item.value.toLowerCase())).slice(0, 10).map((item) => <Pressable key={item.id} onPress={() => addAttributeValues(index, item.value)} style={[styles.suggestionChip, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><Text style={[styles.suggestionText, { color: colors.textSecondary }]}>+ {item.value}</Text></Pressable>)}</ScrollView> : null}
                </View>;
              })}
              <View style={styles.quickAttributeRow}><Pressable accessibilityRole="button" onPress={() => addVariantAttribute()} style={[styles.addAttributeButton, { borderColor: colors.primary + '88', backgroundColor: colors.surface }]}><Plus color={colors.primary} size={17} /><Text style={[styles.addAttributeText, { color: colors.primary }]}>Add attribute</Text></Pressable>{QUICK_VARIATION_ATTRIBUTES.map((name) => <Pressable key={name} onPress={() => addVariantAttribute(name)} style={[styles.quickAttributeButton, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}><Text style={[styles.quickAttributeText, { color: colors.textSecondary }]}>+ {name}</Text></Pressable>)}</View>
              {fieldErrors.attributes ? <Text style={[styles.variantError, { color: colors.error }]}>{fieldErrors.attributes}</Text> : null}
              {generatedCombinationCount > MAX_PRODUCT_VARIANTS ? <Text style={[styles.variantLimitNotice, { color: colors.warning, backgroundColor: colors.warningSoft }]}>There are {generatedCombinationCount.toLocaleString()} combinations. The first {MAX_PRODUCT_VARIANTS} are shown; reduce values before saving.</Text> : null}
              {generatedVariants.length ? <>
                <View style={[styles.variantPreview, { backgroundColor: colors.surfaceSecondary }]}><Text style={[styles.variantPreviewTitle, { color: colors.text }]}>{generatedVariants.length} variant{generatedVariants.length === 1 ? '' : 's'} · Total stock {generatedVariants.reduce((total, variant) => total + (variant.stock ?? 0), 0).toLocaleString()}</Text></View>
                <View style={[styles.bulkVariantCard, { borderColor: colors.primary + '55', backgroundColor: colors.primarySoft }]}><View style={styles.bulkVariantHeading}><Sparkles color={colors.primary} size={16} /><Text style={[styles.bulkVariantTitle, { color: colors.text }]}>Edit all variants</Text></View><View style={styles.variantValuesRow}>{([['price', 'Apply price'], ['salePrice', 'Apply sale price'], ['stock', 'Apply stock'], ['weight', 'Apply weight']] as const).map(([key, placeholder]) => <TextInput key={key} value={bulkVariantValues[key]} onChangeText={(value) => setBulkVariantValues((current) => ({ ...current, [key]: key === 'stock' ? value.replace(/\D/g, '') : sanitizeMoneyInput(value) }))} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={key === 'stock' ? 'numeric' : 'decimal-pad'} style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text, backgroundColor: colors.surface }]} accessibilityLabel={placeholder} />)}</View><AppButton label="Apply to all" onPress={applyBulkVariantValues} /></View>
                {generatedVariants.map((variant) => {
                  const key = variantKey(variant.attributes);
                  const current = form.variantOverrides[key] ?? { sku: variant.sku ?? '', price: variant.basePrice ?? '', salePrice: variant.salePrice ?? '', stock: String(variant.stock ?? ''), weight: variant.weight ?? '', isActive: variant.isActive ?? true };
                  const updateVariant = (field: keyof typeof current, value: string) => setForm((state) => ({ ...state, variantOverrides: { ...state.variantOverrides, [key]: { ...(state.variantOverrides[key] ?? current), [field]: value } } }));
                  return <View key={key} style={[styles.variantItem, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}>
                    <View style={styles.variantItemHeading}><Text style={[styles.variantItemName, { color: colors.text, flex: 1 }]}>{variant.attributes.map(({ name, value }) => `${name}: ${value}`).join(' · ')}</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: current.isActive }} accessibilityLabel={`Set ${variant.attributes.map(({ value }) => value).join(' ')} ${current.isActive ? 'inactive' : 'active'}`} onPress={() => setForm((state) => ({ ...state, variantOverrides: { ...state.variantOverrides, [key]: { ...(state.variantOverrides[key] ?? current), isActive: !current.isActive } } }))} style={[styles.variantSwitch, { backgroundColor: current.isActive ? colors.primary : colors.textMuted }]}><View style={[styles.variantSwitchThumb, current.isActive ? styles.variantSwitchThumbOn : styles.variantSwitchThumbOff]} /></Pressable></View>
                    <TextInput value={current.sku} onChangeText={(value) => updateVariant('sku', value)} placeholder="Variant SKU" placeholderTextColor={colors.textMuted} style={[styles.variantInput, { borderColor: colors.cardBorder, color: colors.text }]} autoCapitalize="characters" accessibilityLabel="Variant SKU" />
                    <View style={styles.variantValuesRow}>
                      <TextInput value={current.price} onChangeText={(value) => updateVariant('price', sanitizeMoneyInput(value))} placeholder="Base price" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" inputMode="decimal" style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text }]} accessibilityLabel="Variant base price" />
                      <TextInput value={current.salePrice} onChangeText={(value) => updateVariant('salePrice', sanitizeMoneyInput(value))} placeholder="Sale price" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" inputMode="decimal" style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text }]} accessibilityLabel="Variant sale price" />
                    </View>
                    <View style={styles.variantValuesRow}>
                      <TextInput value={current.stock} onChangeText={(value) => updateVariant('stock', value)} placeholder="Stock" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text }]} accessibilityLabel="Variant stock" />
                      <TextInput value={current.weight} onChangeText={(value) => updateVariant('weight', value)} placeholder="Weight (kg)" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.variantInput, styles.variantValueInput, { borderColor: colors.cardBorder, color: colors.text }]} accessibilityLabel="Variant weight" />
                    </View>
                  </View>;
                })}
              </> : null}
              </> : <Text style={[styles.simpleProductHint, { color: colors.textSecondary }]}>This product will use one SKU and the stock and price above.</Text>}
            </View>
            <View style={styles.productStatus}>
              <Text style={[styles.statusLabel, { color: colors.text }]}>Status</Text>
              <View style={[styles.statusControl, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]} accessibilityRole="radiogroup" accessibilityLabel="Product status">
                <Pressable accessibilityRole="radio" accessibilityState={{ selected: form.isActive }} onPress={() => setForm((current) => ({ ...current, isActive: true }))} style={[styles.statusOption, form.isActive && { backgroundColor: colors.success }]}>
                  <View style={[styles.statusDot, { backgroundColor: form.isActive ? '#fff' : colors.textMuted }]} />
                  <Text style={[styles.statusOptionText, { color: form.isActive ? '#fff' : colors.textSecondary }]}>Active</Text>
                </Pressable>
                <Pressable accessibilityRole="radio" accessibilityState={{ selected: !form.isActive }} onPress={() => setForm((current) => ({ ...current, isActive: false }))} style={[styles.statusOption, !form.isActive && { backgroundColor: colors.error }]}>
                  <View style={[styles.statusDot, { backgroundColor: !form.isActive ? '#fff' : colors.textMuted }]} />
                  <Text style={[styles.statusOptionText, { color: !form.isActive ? '#fff' : colors.textSecondary }]}>Inactive</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </AppCard>
        <AppCard padding="md">
          <View style={styles.variantSection}>
              <View style={styles.sectionIntro}><AppText variant="section">Sell on Multiple Channels</AppText><AppText variant="small" tone="secondary">List this product on each connected sales channel and store.</AppText></View>
              {channelsQuery.isLoading || catalogQueries.some((query) => query.isLoading) ? <Text style={{ color: colors.textSecondary }}>Checking connected catalogs…</Text> : catalogOptions.length ? catalogOptions.map((catalog) => {
                const enabled = selectedCatalogs.some((item) => item.channelId === catalog.channelId && item.catalogId === catalog.catalogId);
                return <Pressable key={catalog.channelId} accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={() => setSelectedCatalogs((current) => enabled ? current.filter((item) => item.channelId !== catalog.channelId) : [...current, { channelId: catalog.channelId, catalogId: catalog.catalogId }])} style={[styles.catalogRow, { borderColor: enabled ? isDark ? '#25D366' : '#69E99A' : colors.cardBorder, backgroundColor: enabled ? isDark ? '#123B2B' : '#F0FFF6' : colors.surface }]}>
                  <View style={[styles.whatsappIcon, { backgroundColor: isDark ? '#164A35' : '#DDF9E8' }]}><ChannelLogo type="WHATSAPP" box={30} glyph={15} radius={15} /></View>
                  <View style={styles.catalogCopy}>
                    <View style={styles.catalogTitleRow}><Text style={{ color: colors.text, fontWeight: '600' }}>{catalog.catalogName}</Text><Text style={[styles.whatsappBadge, { backgroundColor: isDark ? '#14532D' : '#D1FAE5', color: isDark ? '#86EFAC' : '#047857' }]}>WhatsApp</Text></View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Channel: <Text style={{ color: colors.text, fontWeight: '500' }}>{catalog.channelName}</Text></Text>
                  </View>
                  <View style={[styles.catalogSwitch, { backgroundColor: enabled ? '#25D366' : colors.textMuted }]}><View style={[styles.catalogSwitchThumb, enabled ? styles.catalogSwitchThumbOn : styles.catalogSwitchThumbOff]} /></View>
                </Pressable>;
              }) : <Text style={{ color: colors.textSecondary }}>No connected WhatsApp catalogs found.</Text>}
              {!channelsQuery.isLoading && !catalogQueries.some((query) => query.isLoading) && catalogOptions.length ? <View style={styles.catalogNote}><Info color={colors.textSecondary} size={14} /><Text style={[styles.catalogNoteText, { color: colors.textSecondary }]}>Connected channels and stores are switched on by default and stay synced with this product.</Text></View> : null}
          </View>
        </AppCard>
        {error ? <ErrorState message={error} /> : null}
        <AppButton block icon={Save} label={mutation.isPending ? 'Saving...' : editing ? 'Update Product' : 'Create Product'} loading={mutation.isPending} disabled={mutation.isPending || !catalogsReady} onPress={saveProduct} style={styles.save} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg },
  fields: { gap: spacing.md },
  descriptionField: { gap: spacing.sm },
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
  categoryPicker: { gap: spacing.xs },
  categoryLabel: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  selectedCategory: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', height: 44, justifyContent: 'space-between', paddingLeft: spacing.md, paddingRight: spacing.xs },
  selectedCategoryCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  selectedCategoryName: { flex: 1, fontSize: fontSize.small, fontWeight: fontWeight.medium },
  categoryDot: { borderRadius: radius.pill, height: 8, width: 8 },
  clearCategory: { alignItems: 'center', borderRadius: radius.sm, height: 32, justifyContent: 'center', width: 32 },
  categoryList: { gap: spacing.sm, paddingVertical: 2 },
  categoryChip: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: 12, paddingVertical: 8 },
  categoryChipText: { fontSize: fontSize.tiny, fontWeight: fontWeight.medium },
  categoryAdd: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  categoryAddButton: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', gap: spacing.xs, height: inputHeightDense, justifyContent: 'center', minWidth: 78, paddingHorizontal: spacing.md },
  categoryAddButtonText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  categoryError: { fontSize: fontSize.small, lineHeight: 17 },
  skuRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  skuInput: { flex: 1 },
  skuGenerateButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, height: 48, justifyContent: 'center', marginBottom: 3, width: 48 },
  categoryField: { flex: 1 },
  catalogRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  catalogCopy: { flex: 1 },
  catalogTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: 2 },
  whatsappIcon: { alignItems: 'center', borderRadius: radius.pill, height: 30, justifyContent: 'center', overflow: 'hidden', width: 30 },
  whatsappBadge: { borderRadius: radius.pill, fontSize: 10, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 },
  catalogSwitch: { borderRadius: radius.pill, height: 20, justifyContent: 'center', width: 34 },
  catalogSwitchThumb: { backgroundColor: '#fff', borderRadius: radius.pill, height: 16, position: 'absolute', width: 16 },
  catalogSwitchThumbOn: { right: 2 },
  catalogSwitchThumbOff: { left: 2 },
  catalogNote: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  catalogNoteText: { flex: 1, fontSize: fontSize.tiny },
  variantTitle: { fontSize: 15, fontWeight: '700' },
  variantHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  variantHeadingCopy: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  variantMode: { borderRadius: radius.pill, flexDirection: 'row', padding: 3 },
  variantModeButton: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  variantModeLabel: { fontSize: fontSize.tiny, fontWeight: fontWeight.semibold },
  variantPreview: { borderRadius: radius.md, gap: spacing.xs, padding: spacing.md },
  variantPreviewTitle: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  bulkVariantCard: { borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  bulkVariantHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  bulkVariantTitle: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  variantItem: { borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  variantItemHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  variantItemName: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  variantValuesRow: { flexDirection: 'row', gap: spacing.sm },
  variantInput: { borderRadius: radius.sm, borderWidth: 1, fontSize: fontSize.small, height: 40, paddingHorizontal: spacing.sm },
  variantValueInput: { flex: 1, minWidth: 0 },
  variantSwitch: { borderRadius: radius.pill, height: 24, justifyContent: 'center', width: 42 },
  variantSwitchThumb: { backgroundColor: '#fff', borderRadius: radius.pill, height: 18, position: 'absolute', width: 18 },
  variantSwitchThumbOn: { right: 3 },
  variantSwitchThumbOff: { left: 3 },
  variantError: { fontSize: fontSize.small },
  variantLimitNotice: { borderRadius: radius.md, fontSize: fontSize.tiny, padding: spacing.sm },
  simpleProductHint: { fontSize: fontSize.small },
  attributeCard: { borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  attributeHeaderRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  attributeField: { flex: 1 },
  removeAttributeButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, height: 44, justifyContent: 'center', marginBottom: spacing.xs, width: 44 },
  suggestionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.xs },
  suggestionChip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  suggestionText: { fontSize: fontSize.tiny, fontWeight: fontWeight.medium },
  valueEntry: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, minHeight: 46, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  valueChip: { alignItems: 'center', borderRadius: radius.pill, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  valueChipText: { fontSize: fontSize.tiny, fontWeight: fontWeight.semibold },
  valueEntryInput: { flexGrow: 1, minWidth: 150, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  quickAttributeRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  quickAttributeButton: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  quickAttributeText: { fontSize: fontSize.tiny, fontWeight: fontWeight.medium },
  addAttributeButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radius.md, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addAttributeText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  productStatus: { gap: spacing.xs },
  statusLabel: { fontSize: fontSize.small, fontWeight: fontWeight.bold },
  statusControl: { alignSelf: 'flex-start', borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: 4, padding: 4 },
  statusOption: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minWidth: 88, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statusDot: { borderRadius: radius.pill, height: 8, width: 8 },
  statusOptionText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
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
