import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Check, Plus, Save, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createProduct, fetchProduct, updateProduct, type ProductInput, type ProductResponse } from '../api/products';
import { uploadFile } from '../api/client';
import { ErrorState } from '../components/ErrorState';
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
  name: '', sku: '', category: '', price: '', salePrice: '', inventory: '', stockAlert: '', description: '', currency: 'USD', weight: '0.05', dimensionL: '', dimensionW: '', dimensionH: '', isActive: true, attributes: [],
};

function productToForm(product: ProductResponse): FormState {
  return {
    name: product.name,
    sku: product.sku ?? '',
    category: product.category ?? '',
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

export function ProductFormScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SettingsStackParamList, 'ProductForm'>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { workspace } = useWorkspaceAccess();
  const productId = route.params?.productId;
  const editing = Boolean(productId);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [imageAttachmentIds, setImageAttachmentIds] = useState<string[]>([]);
  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId as string),
    enabled: editing,
  });

  useEffect(() => {
    if (productQuery.data) {
      setForm(productToForm(productQuery.data));
      setImageUris(productQuery.data.imageUrls ?? []);
    }
  }, [productQuery.data]);

  const updateField = (key: keyof FormState) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const toOptionalNumber = (value: string) => value.trim() ? Number(value) : undefined;
  const payload = (): ProductInput => ({
    name: form.name.trim(),
    sku: form.sku.trim() || undefined,
    category: form.category.trim() || undefined,
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
  });
  const mutation = useMutation({
    mutationFn: () => {
      const input = { ...payload(), imageAttachmentIds: imageAttachmentIds.length ? imageAttachmentIds : undefined };
      return editing ? updateProduct(productId as string, input) : createProduct(input);
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, 8 - imageUris.length), quality: 0.85 });
    if (result.canceled) return;
    try {
      const uploaded = await Promise.all(result.assets.map((asset) => uploadFile('/files/upload', asset.uri, asset.fileName ?? `product-${Date.now()}.jpg`, asset.mimeType ?? 'image/jpeg', { workspaceId: workspace.id })));
      setImageUris((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 8));
      setImageAttachmentIds((current) => [...current, ...uploaded.map((item) => item.id)].slice(0, 8));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not upload product images.');
    }
  };

  if (editing && productQuery.isLoading) return <FormSkeleton fields={7} />;
  if (editing && (productQuery.isError || !productQuery.data)) return <ErrorState message="Could not load product." onRetry={() => productQuery.refetch()} />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={editing ? 'Edit product' : 'Create product'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <AppCard>
          <Text style={[styles.variantTitle, { color: colors.text }]}>Product gallery</Text>
          <View style={styles.gallery}>
            {imageUris.map((uri, index) => <Image key={`${uri}-${index}`} source={{ uri }} style={styles.galleryImage} contentFit="cover" />)}
            {imageUris.length < 8 ? <AppButton variant="secondary" label={imageUris.length ? 'Add images' : 'Add image'} onPress={() => void pickImages()} /> : null}
          </View>
        </AppCard>
        <AppCard>
          <View style={styles.fields}>
            <AppTextField label="Product name" value={form.name} onChangeText={updateField('name')} placeholder="e.g. Blue T-shirt" />
            <AppTextField label="SKU" value={form.sku} onChangeText={updateField('sku')} placeholder="Optional SKU" />
            <AppTextField label="Category" value={form.category} onChangeText={updateField('category')} placeholder="Optional category" />
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
          {error ? <ErrorState message={error} /> : null}
          <AppButton block icon={Save} label={mutation.isPending ? 'Saving...' : editing ? 'Save product' : 'Create product'} loading={mutation.isPending} disabled={!form.name.trim() || mutation.isPending} onPress={() => { setError(null); mutation.mutate(); }} style={styles.save} />
        </AppCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg },
  fields: { gap: spacing.md },
  dimensionRow: { flexDirection: 'row', gap: spacing.sm },
  dimensionField: { flex: 1 },
  variantSection: { gap: spacing.sm },
  variantTitle: { fontSize: 15, fontWeight: '700' },
  attributeRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  attributeField: { flex: 1 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  galleryImage: { borderRadius: 10, height: 76, width: 76 },
  save: { marginTop: spacing.lg },
});
