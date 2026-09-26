import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createProduct, fetchProduct, updateProduct, type ProductInput, type ProductResponse } from '../api/products';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton } from '../components/Skeleton';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
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
};

const EMPTY_FORM: FormState = {
  name: '', sku: '', category: '', price: '', salePrice: '', inventory: '', stockAlert: '', description: '',
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
  };
}

export function ProductFormScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SettingsStackParamList, 'ProductForm'>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const productId = route.params?.productId;
  const editing = Boolean(productId);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId as string),
    enabled: editing,
  });

  useEffect(() => {
    if (productQuery.data) setForm(productToForm(productQuery.data));
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
    isActive: productQuery.data?.status === 'ACTIVE' || !editing,
  });
  const mutation = useMutation({
    mutationFn: () => editing ? updateProduct(productId as string, payload()) : createProduct(payload()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      if (editing) await queryClient.invalidateQueries({ queryKey: ['product', productId] });
      navigation.goBack();
    },
    onError: (value: Error) => setError(value.message),
  });

  if (editing && productQuery.isLoading) return <FormSkeleton fields={7} />;
  if (editing && (productQuery.isError || !productQuery.data)) return <ErrorState message="Could not load product." onRetry={() => productQuery.refetch()} />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={editing ? 'Edit product' : 'Create product'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <AppCard>
          <View style={styles.fields}>
            <AppTextField label="Product name" value={form.name} onChangeText={updateField('name')} placeholder="e.g. Blue T-shirt" />
            <AppTextField label="SKU" value={form.sku} onChangeText={updateField('sku')} placeholder="Optional SKU" />
            <AppTextField label="Category" value={form.category} onChangeText={updateField('category')} placeholder="Optional category" />
            <AppTextField label="Price" value={form.price} onChangeText={updateField('price')} placeholder="0.00" keyboardType="decimal-pad" />
            <AppTextField label="Sale price" value={form.salePrice} onChangeText={updateField('salePrice')} placeholder="Optional sale price" keyboardType="decimal-pad" />
            <AppTextField label="Inventory" value={form.inventory} onChangeText={updateField('inventory')} placeholder="Optional quantity" keyboardType="numeric" />
            <AppTextField label="Stock alert" value={form.stockAlert} onChangeText={updateField('stockAlert')} placeholder="Optional threshold" keyboardType="numeric" />
            <AppTextField label="Description" value={form.description} onChangeText={updateField('description')} placeholder="Describe this product" multiline numberOfLines={5} />
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
  save: { marginTop: spacing.lg },
});
