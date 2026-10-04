import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Check, Minus, Package, Plus, Search, Truck, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchChannels } from '../api/channels';
import { fetchMyWorkspaces } from '../api/workspaces';
import { getCourierDeliveryFees, getCourierDeliveryZone, listCourierConnections } from '../api/couriers';
import { createOrder, listOrderAreas, listOrderCities, listOrderZones, type OrderLocationOption } from '../api/orders';
import { listProducts, type ProductResponse, type ProductVariant } from '../api/products';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { ChannelLogo } from '../components/ChannelLogo';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard, AppText, AppTextField, ScreenHeader } from '../ui';

type Picker = 'source' | 'city' | 'zone' | 'area' | 'courier' | 'variant' | null;
type PaymentMethod = 'COD' | 'PAID' | 'PARTIAL';
type CartItem = { id: string; product: ProductResponse | null; productVariantId: string | null; variantLabel: string | null; name: string; imageUrl: string | null; quantity: number; unitPrice: string; weightKg: string };

const SALES_SOURCE_TYPES = new Set(['WHATSAPP', 'MESSENGER', 'TIKTOK', 'INSTAGRAM', 'WEBCHAT', 'SHOPIFY', 'WOOCOMMERCE']);

function productPrice(product: ProductResponse) {
  return product.salePriceMinor ?? product.priceMinor ?? 0;
}

function productVariantPrice(product: ProductResponse, variant: ProductVariant) {
  return variant.salePriceMinor ?? variant.priceMinor ?? product.salePriceMinor ?? product.priceMinor ?? 0;
}

function productVariantLabel(variant: ProductVariant) {
  return variant.attributes.map((attribute) => `${attribute.attributeName}: ${attribute.value}`).join(' · ');
}

function findCityInAddress(address: string, cities: OrderLocationOption[]) {
  const normalizedAddress = address.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const segments = address.split(/[\n,]+/).map((segment) => segment.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim());
  return cities
    .map((city) => ({ city, normalizedName: city.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter(({ normalizedName }) => normalizedName.length >= 2 && normalizedAddress.includes(normalizedName))
    .sort((left, right) => Number(segments.includes(right.normalizedName)) - Number(segments.includes(left.normalizedName)) || right.normalizedName.length - left.normalizedName.length)[0]?.city ?? null;
}

function formatMoney(valueMinor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(valueMinor / 100);
  } catch {
    return `${currency} ${(valueMinor / 100).toFixed(2)}`;
  }
}

export function CreateOrderScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const route = useRoute<RouteProp<SettingsStackParamList, 'CreateOrder'>>();
  const isSheetPresentation = route.params?.presentation === 'sheet';
  const initialRecipient = route.params?.initialRecipient;
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [picker, setPicker] = useState<Picker>(null);
  const [sourceId, setSourceId] = useState(route.params?.initialSourceChannelId ?? '');
  const [city, setCity] = useState<OrderLocationOption | null>(null);
  const [zone, setZone] = useState<OrderLocationOption | null>(null);
  const [area, setArea] = useState<OrderLocationOption | null>(null);
  const [courierId, setCourierId] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('COD');
  const [partialAmount, setPartialAmount] = useState('0.00');
  const [recipientName, setRecipientName] = useState(initialRecipient?.name ?? '');
  const [recipientPhone, setRecipientPhone] = useState(initialRecipient?.phone ?? '');
  const [recipientEmail, setRecipientEmail] = useState(initialRecipient?.email ?? '');
  const [address, setAddress] = useState(initialRecipient?.address ?? '');
  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [debouncedLocationSearch, setDebouncedLocationSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductResponse | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [customProductMode, setCustomProductMode] = useState(false);
  const [customProductName, setCustomProductName] = useState('');
  const [customVariantLabel, setCustomVariantLabel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0.00');
  const [weightKg, setWeightKg] = useState('0.00');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const workspaceQuery = useQuery({ queryKey: ['workspaces', 'mine'], queryFn: fetchMyWorkspaces, staleTime: 30_000 });
  const currency = workspaceQuery.data?.items?.[0]?.defaultCurrency || 'BDT';
  const channelsQuery = useQuery({ queryKey: ['channels'], queryFn: fetchChannels });
  const channels = (channelsQuery.data?.items ?? []).filter((item) => item.status === 'CONNECTED' && SALES_SOURCE_TYPES.has(item.type.toUpperCase()));
  const selectedSource = channels.find((item) => item.id === sourceId) ?? null;
  const productsQuery = useQuery({
    queryKey: ['create-order-products', debouncedSearch],
    queryFn: () => listProducts({ search: debouncedSearch || undefined, status: 'ACTIVE', page: 1, limit: 20 }),
    enabled: productPickerOpen && !selectedProduct && !customProductMode,
    staleTime: 30_000,
  });
  const couriersQuery = useQuery({ queryKey: ['courier-connections'], queryFn: listCourierConnections });
  const couriers = (couriersQuery.data?.items ?? []).filter((item) => item.status === 'CONNECTED');
  const selectedCourier = couriers.find((item) => item.id === courierId) ?? null;
  const citiesQuery = useQuery({ queryKey: ['order-locations', 'cities', debouncedLocationSearch], queryFn: () => listOrderCities(debouncedLocationSearch || undefined), enabled: picker === 'city', staleTime: 10 * 60_000 });
  const addressCitiesQuery = useQuery({ queryKey: ['order-locations', 'cities', 'all'], queryFn: () => listOrderCities(), enabled: Boolean(address.trim()), staleTime: 10 * 60_000 });
  const detectedCity = useMemo(() => findCityInAddress(address, addressCitiesQuery.data?.items ?? []), [address, addressCitiesQuery.data?.items]);
  const zonesQuery = useQuery({ queryKey: ['order-locations', 'zones', city?.id, debouncedLocationSearch], queryFn: () => listOrderZones(city!.id, debouncedLocationSearch || undefined), enabled: picker === 'zone' && Boolean(city), staleTime: 10 * 60_000 });
  const areasQuery = useQuery({ queryKey: ['order-locations', 'areas', zone?.id, debouncedLocationSearch], queryFn: () => listOrderAreas(zone!.id, debouncedLocationSearch || undefined), enabled: picker === 'area' && Boolean(zone), staleTime: 10 * 60_000 });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(productSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [productSearch]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedLocationSearch(locationSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [locationSearch]);
  useEffect(() => {
    if (!detectedCity || city?.id === detectedCity.id) return;
    setCity(detectedCity);
    setZone(null);
    setArea(null);
  }, [city?.id, detectedCity]);
  const selectedCurrency = currency.toUpperCase();
  const subtotalMinor = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * (Math.round((Number.parseFloat(item.unitPrice) || 0) * 100)), 0), [cart]);
  const deliveryZone = getCourierDeliveryZone(city?.name || detectedCity?.name || address);
  const courierFees = getCourierDeliveryFees(selectedCourier?.providerConfig);
  const deliveryFee = !selectedCourier ? 0 : deliveryZone === 'OUTSIDE_DHAKA' ? courierFees.outsideDhaka : courierFees.insideDhaka;
  const deliveryFeeMinor = Math.round(deliveryFee * 100);
  const totalMinor = subtotalMinor + deliveryFeeMinor;
  const paidMinor = payment === 'PAID' ? totalMinor : payment === 'PARTIAL' ? Math.min(Math.max(Math.round((Number.parseFloat(partialAmount) || 0) * 100), 0), totalMinor) : 0;
  const dueMinor = Math.max(totalMinor - paidMinor, 0);

  useEffect(() => {
    if (!sourceId && channels.length) setSourceId(channels[0].id);
  }, [channels, sourceId]);

  const changeCartQuantity = (itemId: string, delta: number) => setCart((current) => current.map((item) => item.id === itemId ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  const chooseProduct = (product: ProductResponse) => {
    setSelectedProduct(product);
    setSelectedVariant(null);
    setCustomProductMode(false);
    setQuantity('1');
    setUnitPrice((productPrice(product) / 100).toFixed(2));
    setWeightKg(((product.weightGrams ?? 0) / 1000).toFixed(2));
    setProductSearch('');
    setDebouncedSearch('');
    setProductPickerOpen(false);
  };
  const chooseVariant = (variant: ProductVariant) => {
    if (!selectedProduct) return;
    setSelectedVariant(variant);
    setUnitPrice((productVariantPrice(selectedProduct, variant) / 100).toFixed(2));
    setWeightKg(((variant.weightGrams ?? selectedProduct.weightGrams ?? 0) / 1000).toFixed(2));
  };
  const startCustomProduct = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setCustomProductMode(true);
    setCustomProductName(productSearch.trim());
    setCustomVariantLabel('');
    setProductSearch('');
    setDebouncedSearch('');
    setProductPickerOpen(false);
    setQuantity('1');
    setUnitPrice('0.00');
    setWeightKg('0.00');
  };
  const addProduct = () => {
    if (customProductMode && !customProductName.trim()) {
      setError('Enter a product name.');
      return;
    }
    if (!customProductMode && !selectedProduct) return;
    const activeVariants = selectedProduct?.variants?.filter((item) => item.isActive) ?? [];
    if (!customProductMode && selectedProduct?.hasVariants && activeVariants.length === 0) {
      setError('This product has no active variations available.');
      return;
    }
    if (!customProductMode && (selectedProduct?.hasVariants || activeVariants.length > 0) && !selectedVariant) {
      setError('Select a product variation before adding it to the cart.');
      return;
    }
    const nextQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
    const nextPrice = Math.max(0, Number.parseFloat(unitPrice) || 0).toFixed(2);
    const nextWeight = Math.max(0, Number.parseFloat(weightKg) || 0).toFixed(3);
    const product = selectedProduct;
    const variantLabel = selectedVariant ? productVariantLabel(selectedVariant) : customVariantLabel.trim() || null;
    const itemName = product?.name ?? customProductName.trim();
    const itemId = product ? `${product.id}:${selectedVariant?.id ?? 'base'}` : `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCart((current) => {
      const existing = product ? current.find((item) => item.product?.id === product.id && item.productVariantId === (selectedVariant?.id ?? null)) : undefined;
      if (existing) return current.map((item) => item.id === existing.id ? { ...item, quantity: item.quantity + nextQuantity, unitPrice: nextPrice, weightKg: nextWeight } : item);
      return [...current, { id: itemId, product, productVariantId: selectedVariant?.id ?? null, variantLabel, name: itemName, imageUrl: product?.coverImageUrl ?? product?.imageUrls[0] ?? null, quantity: nextQuantity, unitPrice: nextPrice, weightKg: nextWeight }];
    });
    setSelectedProduct(null);
    setSelectedVariant(null);
    setCustomProductMode(false);
    setCustomProductName('');
    setCustomVariantLabel('');
    setError('');
    setQuantity('1');
    setUnitPrice('0.00');
    setWeightKg('0.00');
  };

  const pickerOptions: Array<{ id: string; label: string; type?: string; variant?: ProductVariant }> = picker === 'source'
    ? channels.map((item) => ({ id: item.id, label: item.name, type: item.type }))
    : picker === 'city' ? (citiesQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
      : picker === 'zone' ? (zonesQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
        : picker === 'area' ? (areasQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
          : picker === 'courier' ? [{ id: '', label: 'No delivery partner' }, ...couriers.map((item) => ({ id: item.id, label: item.displayName }))]
            : picker === 'variant' ? (selectedProduct?.variants ?? []).filter((item) => item.isActive).map((variant) => ({ id: variant.id, label: productVariantLabel(variant), variant })) : [];
  const pickerTitle = picker === 'source' ? 'Order source' : picker === 'city' ? 'Select city' : picker === 'zone' ? 'Select zone' : picker === 'area' ? 'Select area' : picker === 'variant' ? 'Select variation' : 'Delivery partner';
  const pickerLoading = (picker === 'city' && citiesQuery.isLoading) || (picker === 'zone' && zonesQuery.isLoading) || (picker === 'area' && areasQuery.isLoading);

  const choose = (id: string) => {
    if (picker === 'source') setSourceId(id);
    if (picker === 'city') { const selected = citiesQuery.data?.items.find((item) => item.id === id) ?? null; setCity(selected); setZone(null); setArea(null); }
    if (picker === 'zone') { const selected = zonesQuery.data?.items.find((item) => item.id === id) ?? null; setZone(selected); setArea(null); }
    if (picker === 'area') setArea(areasQuery.data?.items.find((item) => item.id === id) ?? null);
    if (picker === 'courier') setCourierId(id);
    if (picker === 'variant') {
      const selected = pickerOptions.find((option) => option.id === id)?.variant;
      if (selected) chooseVariant(selected);
    }
    setPicker(null);
    setLocationSearch('');
    setDebouncedLocationSearch('');
  };
  const openPicker = (nextPicker: Picker) => {
    setLocationSearch('');
    setDebouncedLocationSearch('');
    setPicker(nextPicker);
  };
  const closePicker = () => {
    setLocationSearch('');
    setDebouncedLocationSearch('');
    setPicker(null);
  };

  const save = async () => {
    if (!cart.length) { setError('Add at least one product to the order.'); return; }
    if (!recipientName.trim() || !recipientPhone.trim()) { setError('Add the required recipient name and phone number.'); return; }
    if (!address.trim()) { setError('Add the delivery address.'); return; }
    if (!sourceId) { setError('Select a connected sales channel as the order source.'); return; }
    const numericValues = [...cart.map((item) => item.unitPrice), ...cart.map((item) => item.weightKg)];
    if (payment === 'PARTIAL') numericValues.push(partialAmount);
    if (numericValues.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      setError('Prices, weight, and payment amounts must be valid non-negative numbers.'); return;
    }
    setSaving(true); setError('');
    try {
      await createOrder({
        sourceChannelId: sourceId,
        courierConnectionId: courierId || null,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        recipientEmail: recipientEmail.trim() || null,
        address: address.trim(),
        cityId: city?.id ?? detectedCity?.id ?? null,
        zoneId: zone?.id ?? null,
        areaId: area?.id ?? null,
        currency: selectedCurrency,
        paymentMethod: payment,
        amountPaidMinor: payment === 'PAID' ? totalMinor : paidMinor,
        deliveryFeeMinor,
        items: cart.map((item) => item.product
          ? {
              productId: item.product.id,
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              unitPriceMinor: Math.round(Number.parseFloat(item.unitPrice) * 100),
              weightGrams: Math.round(Number.parseFloat(item.weightKg) * 1000),
            }
          : {
              productId: null,
              productName: item.name,
              variantLabel: item.variantLabel,
              quantity: item.quantity,
              unitPriceMinor: Math.round(Number.parseFloat(item.unitPrice) * 100),
              weightGrams: Math.round(Number.parseFloat(item.weightKg) * 1000),
            }),
      });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigation.goBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the order. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const FormScrollView = isSheetPresentation ? SheetScrollView : ScrollView;
  const screenBody = (
    <View style={styles.createOrderBody}>
      {isSheetPresentation ? <View style={[styles.createOrderSheetHeader, { borderBottomColor: colors.cardBorder }]}><View style={styles.createOrderSheetTitle}><Text style={[styles.createOrderSheetTitleText, { color: colors.text }]}>Create order</Text><Text style={[styles.helper, { color: colors.textSecondary }]}>Add products and delivery details</Text></View><Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Close create order"><X color={colors.textSecondary} size={22} /></Pressable></View> : <ScreenHeader title="Create order" subtitle="Add products and delivery details" onBack={() => navigation.goBack()} />}
      <FormScrollView style={isSheetPresentation ? styles.createOrderSheetScroll : undefined} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.xxxl) }]} keyboardShouldPersistTaps="handled">
        <AppCard style={styles.card}>
          <View style={styles.sectionHeading}><Package color={colors.primary} size={18} /><Text style={[styles.sectionTitle, { color: colors.text }]}>Products</Text></View>
          <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Search color={colors.textMuted} size={17} />
            <TextInput
              value={productSearch}
              onChangeText={(value) => {
                setProductSearch(value);
                setProductPickerOpen(true);
                setCustomProductMode(false);
                setSelectedProduct(null);
                setSelectedVariant(null);
              }}
              onFocus={() => setProductPickerOpen(true)}
              placeholder="Search or select a product"
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>
          {productPickerOpen && !selectedProduct && !customProductMode ? <View style={[styles.searchResults, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Pressable onPress={startCustomProduct} style={[styles.productResult, { borderBottomColor: colors.cardBorder }]}><View style={[styles.productImage, styles.productImagePlaceholder, { backgroundColor: colors.primarySoft }]}><Plus color={colors.primary} size={18} /></View><Text style={[styles.productName, { color: colors.primary }]}>{productSearch.trim() ? `Add “${productSearch.trim()}” manually` : 'Add a new product manually'}</Text></Pressable>
            {productsQuery.isFetching ? <ActivityIndicator color={colors.primary} style={styles.searchState} /> : productsQuery.isError ? <Text style={[styles.searchStateText, { color: colors.error }]}>Could not load products. Try another search.</Text> : (productsQuery.data?.items ?? []).length ? (
              <ScrollView style={styles.searchResultList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {(productsQuery.data?.items ?? []).map((product) => <Pressable key={product.id} onPress={() => chooseProduct(product)} style={[styles.productResult, { borderBottomColor: colors.cardBorder }]}>
                  {product.coverImageUrl || product.imageUrls[0] ? <Image source={{ uri: product.coverImageUrl ?? product.imageUrls[0] }} style={styles.productImage} contentFit="cover" /> : <View style={[styles.productImage, styles.productImagePlaceholder, { backgroundColor: colors.primarySoft }]}><Package color={colors.primary} size={18} /></View>}
                  <View style={styles.productCopy}><Text style={[styles.productName, { color: colors.text }]} numberOfLines={1}>{product.name}</Text><Text style={[styles.helper, { color: colors.textSecondary }]}>{product.inventory ?? 0} in stock</Text></View>
                  <Text style={[styles.productPrice, { color: colors.text }]}>{formatMoney(productPrice(product), selectedCurrency)}</Text>
                </Pressable>)}
              </ScrollView>
            ) : <Text style={[styles.searchStateText, { color: colors.textSecondary }]}>{productsQuery.isLoading ? 'Loading products...' : 'No active products match this search.'}</Text>}
          </View> : null}
          {selectedProduct || customProductMode ? <View style={[styles.selectedProduct, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={styles.selectedProductHeading}><Text style={[styles.productName, { color: colors.text, flex: 1 }]} numberOfLines={1}>{selectedProduct?.name ?? 'New manual product'}</Text><Pressable onPress={() => { setSelectedProduct(null); setSelectedVariant(null); setCustomProductMode(false); }} accessibilityLabel="Remove selected product"><Text style={[styles.helper, { color: colors.error }]}>Cancel</Text></Pressable></View>
            {customProductMode ? <AppTextField label="Product name *" value={customProductName} onChangeText={setCustomProductName} placeholder="Product name" /> : null}
            {selectedProduct?.hasVariants || (selectedProduct?.variants ?? []).some((item) => item.isActive) ? <PickerButton label="Variation *" value={selectedVariant ? productVariantLabel(selectedVariant) : 'Select a variation'} onPress={() => setPicker('variant')} disabled={!((selectedProduct?.variants ?? []).some((item) => item.isActive))} /> : null}
            {selectedProduct?.hasVariants && !(selectedProduct.variants ?? []).some((item) => item.isActive) ? <Text style={[styles.helper, { color: colors.error }]}>This product has no active variations available.</Text> : null}
            {customProductMode ? <AppTextField label="Variant details (optional)" value={customVariantLabel} onChangeText={setCustomVariantLabel} placeholder="e.g. Size: Large" /> : null}
            <View style={styles.editableFields}><AppTextField style={styles.editableField} label={`Unit price (${selectedCurrency})`} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" /><AppTextField style={styles.editableField} label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" /></View>
            <AppTextField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
            <AppButton block label="Add to cart" icon={Plus} onPress={addProduct} />
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Weight is used for shipping calculations.</Text>
          </View> : null}
          <View style={[styles.cartHeader, { borderTopColor: colors.cardBorder }]}><Text style={[styles.cartTitle, { color: colors.text }]}>Cart items ({cart.length})</Text><Text style={[styles.helper, { color: colors.textSecondary }]}>{cart.reduce((sum, item) => sum + item.quantity, 0)} pcs</Text></View>
          {!cart.length ? <Text style={[styles.helper, { color: colors.textMuted }]}>No products added yet.</Text> : cart.map((item) => <View key={item.id} style={[styles.cartRow, { borderBottomColor: colors.cardBorder }]}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productImage} contentFit="cover" /> : <View style={[styles.productImage, styles.productImagePlaceholder, { backgroundColor: colors.primarySoft }]}><Package color={colors.primary} size={18} /></View>}
            <View style={styles.productCopy}><Text style={[styles.productName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>{item.variantLabel ? <Text style={[styles.helper, { color: colors.textMuted }]}>{item.variantLabel}</Text> : null}<Text style={[styles.helper, { color: colors.textSecondary }]}>{formatMoney(Math.round(Number(item.unitPrice) * 100), selectedCurrency)} each</Text></View>
            <View style={[styles.quantityControl, { borderColor: colors.cardBorder }]}><Pressable onPress={() => changeCartQuantity(item.id, -1)} accessibilityLabel={`Decrease ${item.name} quantity`}><Minus color={colors.textSecondary} size={15} /></Pressable><Text style={[styles.quantityValue, { color: colors.text }]}>{item.quantity}</Text><Pressable onPress={() => changeCartQuantity(item.id, 1)} accessibilityLabel={`Increase ${item.name} quantity`}><Plus color={colors.textSecondary} size={15} /></Pressable></View>
          </View>)}
          <View style={[styles.summary, { borderTopColor: colors.cardBorder }]}>
            <View style={styles.currencyLine}><View><Text style={[styles.helper, { color: colors.textSecondary }]}>Currency</Text><Text style={[styles.currencyValue, { color: colors.text }]}>{selectedCurrency} · workspace default</Text></View><Text style={[styles.helper, { color: colors.textMuted }]}>Used for this order</Text></View>
            <SummaryLine label="Subtotal" value={formatMoney(subtotalMinor, selectedCurrency)} colors={colors} />
            <SummaryLine label={selectedCourier ? `Delivery fee · ${deliveryZone === 'OUTSIDE_DHAKA' ? 'Outside Dhaka' : 'Inside Dhaka'}` : 'Delivery fee'} value={formatMoney(deliveryFeeMinor, selectedCurrency)} colors={colors} />
            <SummaryLine label="Total" value={formatMoney(totalMinor, selectedCurrency)} strong colors={colors} />
            <SummaryLine label="Due on delivery" value={formatMoney(dueMinor, selectedCurrency)} colors={colors} />
          </View>
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Customer information</Text>
          <AppTextField label="Name *" value={recipientName} onChangeText={setRecipientName} placeholder="Recipient name" />
          <AppTextField label="Phone *" value={recipientPhone} onChangeText={setRecipientPhone} placeholder="Phone number" keyboardType="phone-pad" />
          <AppTextField label="Email (optional)" value={recipientEmail} onChangeText={setRecipientEmail} placeholder="recipient@example.com" keyboardType="email-address" autoCapitalize="none" />
          <AppTextField label="Address *" value={address} onChangeText={setAddress} placeholder="Street, building, area details" multiline numberOfLines={3} />
          <View style={styles.locationHeading}><Text style={[styles.helper, { color: colors.textSecondary }]}>City, zone & area (optional)</Text><Text style={[styles.helper, { color: colors.textMuted }]}>Search the lists to find a delivery location.</Text></View>
          <PickerButton label="City" value={city?.name ?? detectedCity?.name ?? 'Select city'} onPress={() => openPicker('city')} />
          <PickerButton label="Zone" value={zone?.name ?? 'Select zone'} onPress={() => openPicker('zone')} disabled={!city} />
          <PickerButton label="Area" value={area?.name ?? 'Select area'} onPress={() => openPicker('area')} disabled={!zone} />
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment</Text>
          <View style={styles.paymentOptions}>{([['COD', 'Cash on delivery'], ['PAID', 'Paid'], ['PARTIAL', 'Partial']] as const).map(([value, label]) => {
            const selected = payment === value;
            return <Pressable key={value} onPress={() => setPayment(value)} style={[styles.paymentOption, { borderColor: selected ? colors.primary : colors.cardBorder, backgroundColor: selected ? colors.primarySoft : colors.surface }]} accessibilityRole="radio" accessibilityState={{ selected }}><Text style={[styles.paymentText, { color: selected ? colors.primary : colors.textSecondary }]}>{label}</Text>{selected ? <Check color={colors.primary} size={14} /> : null}</Pressable>;
          })}</View>
          {payment === 'PARTIAL' ? <AppTextField label="Amount paid now" value={partialAmount} onChangeText={setPartialAmount} keyboardType="decimal-pad" placeholder="0.00" /> : null}
          {payment === 'PARTIAL' ? <Text style={[styles.helper, { color: colors.textSecondary }]}>Due on delivery: {formatMoney(dueMinor, selectedCurrency)}</Text> : null}
        </AppCard>

        <AppCard style={styles.card}>
          <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Order source *</Text></View>
          {channelsQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : channels.length ? <View style={styles.sourcePickerRow}><ChannelLogo type={selectedSource?.type} box={38} glyph={19} radius={12} /><View style={styles.sourcePickerField}><PickerButton label="Connected sales channel" value={selectedSource?.name ?? 'Select a source'} onPress={() => openPicker('source')} /></View></View> : <AppText variant="small" tone="secondary">No connected sales channels are available for orders.</AppText>}
        </AppCard>

        <AppCard style={styles.card}>
          <View style={styles.sectionHeading}><Truck color={colors.primary} size={18} /><Text style={[styles.sectionTitle, { color: colors.text }]}>Delivery partner</Text><Text style={[styles.helper, { color: colors.textMuted }]}>Optional</Text></View>
          {couriersQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : couriers.length ? <PickerButton label="Delivery partner" value={couriers.find((item) => item.id === courierId)?.displayName ?? 'No delivery partner'} onPress={() => openPicker('courier')} /> : <Text style={[styles.helper, { color: colors.textSecondary }]}>No delivery partners connected. Connect one from Integrations to book shipments.</Text>}
        </AppCard>
        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <AppButton block label="Create order" loading={saving} disabled={saving} onPress={() => void save()} />
      </FormScrollView>
      <BottomSheet visible={Boolean(picker)} onClose={closePicker} sheetStyle={styles.pickerSheet}>
        <View style={styles.pickerContent}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{pickerTitle}</Text>
          {picker === 'city' || picker === 'zone' || picker === 'area' ? <View style={[styles.locationSearch, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}><Search color={colors.textMuted} size={16} /><TextInput value={locationSearch} onChangeText={setLocationSearch} placeholder={`Search ${picker}...`} placeholderTextColor={colors.textMuted} style={[styles.locationSearchInput, { color: colors.text }]} /></View> : null}
          <SheetScrollView style={styles.pickerOptionList} contentContainerStyle={styles.pickerOptionContent} keyboardShouldPersistTaps="handled">
            {pickerLoading ? <ActivityIndicator color={colors.primary} style={styles.pickerLoading} /> : pickerOptions.length ? pickerOptions.map((option) => <Pressable key={option.id || 'none'} onPress={() => choose(option.id)} style={[styles.option, styles.optionRow, { borderBottomColor: colors.cardBorder }]}>{picker === 'source' ? <ChannelLogo type={option.type} box={36} glyph={18} radius={11} /> : null}<Text style={[styles.optionLabel, styles.optionMainText, { color: colors.text }]}>{option.label}</Text>{picker === 'source' ? <Text style={[styles.optionType, { color: colors.textMuted }]}>{option.type}</Text> : null}</Pressable>) : <Text style={[styles.helper, { color: colors.textMuted, paddingVertical: spacing.md, textAlign: 'center' }]}>No matching options found.</Text>}
          </SheetScrollView>
          <AppButton label="Close" variant="secondary" onPress={closePicker} />
        </View>
      </BottomSheet>
    </View>
  );
  return isSheetPresentation ? (
    <View style={[styles.screen, styles.transparentScreen]}>
      <BottomSheet visible onClose={() => navigation.goBack()} sheetStyle={styles.createOrderSheet}>
        {screenBody}
      </BottomSheet>
    </View>
  ) : <View style={[styles.screen, { backgroundColor: colors.background }]}>{screenBody}</View>;
}

function SummaryLine({ label, value, strong = false, colors }: { label: string; value: string; strong?: boolean; colors: ThemeColors }) {
  return <View style={[styles.summaryLine, strong && styles.summaryTotal, strong && { borderTopColor: colors.cardBorder }]}><Text style={[styles.summaryLabel, { color: colors.textSecondary }, strong && styles.summaryStrong]}>{label}</Text><Text style={[styles.summaryValue, { color: colors.text }, strong && styles.summaryStrong]}>{value}</Text></View>;
}

function PickerButton({ label, value, onPress, disabled = false }: { label: string; value: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <View style={styles.pickerField}><Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text><Pressable disabled={disabled} onPress={onPress} style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.inputBorder }, disabled && styles.dim]}><Text style={{ color: disabled ? colors.textMuted : colors.text }}>{value}</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { gap: spacing.md, padding: spacing.lg }, card: { gap: spacing.md }, sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, sectionTitle: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold },
  search: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md }, searchInput: { flex: 1, fontSize: fontSize.body, height: 46 }, searchResults: { borderRadius: radius.md, borderWidth: 1, maxHeight: 250, overflow: 'hidden' }, searchResultList: { maxHeight: 202 }, searchState: { padding: spacing.lg }, searchStateText: { padding: spacing.md, textAlign: 'center' }, productResult: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, padding: spacing.sm }, productImage: { borderRadius: radius.sm, height: 42, width: 42 }, productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' }, productCopy: { flex: 1, minWidth: 0 }, productName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold }, productPrice: { fontSize: fontSize.small, fontWeight: fontWeight.bold }, helper: { fontSize: fontSize.small }, selectedProduct: { borderRadius: radius.md, gap: spacing.sm, padding: spacing.md }, selectedProductHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, editableFields: { flexDirection: 'row', gap: spacing.sm }, editableField: { flex: 1, minWidth: 0 }, cartHeader: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.md }, cartTitle: { fontSize: fontSize.body, fontWeight: fontWeight.semibold }, cartRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm }, quantityControl: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, quantityValue: { fontSize: fontSize.small, fontWeight: fontWeight.bold, minWidth: 18, textAlign: 'center' }, summary: { borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingTop: spacing.md }, currencyLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }, currencyValue: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, marginTop: 2 }, summaryLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, summaryLabel: { fontSize: fontSize.caption }, summaryValue: { fontSize: fontSize.caption, fontVariant: ['tabular-nums'] }, summaryTotal: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.xs, paddingTop: spacing.sm }, summaryStrong: { fontSize: fontSize.body, fontWeight: fontWeight.bold }, deliveryFeeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, deliveryFeeInput: { borderRadius: radius.sm, borderWidth: 1, minWidth: 100, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: 'right' },
  pickerField: { gap: spacing.xs }, fieldLabel: { fontSize: fontSize.small, fontWeight: fontWeight.semibold }, pickerButton: { borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.md }, dim: { opacity: 0.5 }, locationHeading: { gap: 2, marginTop: spacing.xs }, locationSearch: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md }, locationSearchInput: { flex: 1, fontSize: fontSize.body, height: 44 }, paymentOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, paymentOption: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, paymentText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold }, error: { fontSize: fontSize.caption }, pickerSheet: { height: '75%', paddingHorizontal: spacing.lg, paddingTop: 0 }, pickerContent: { flex: 1, gap: spacing.md, minHeight: 0 }, pickerOptionList: { flex: 1 }, pickerOptionContent: { paddingBottom: spacing.md }, pickerLoading: { padding: spacing.xl }, option: { borderBottomWidth: 1, paddingVertical: spacing.md }, optionLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
  transparentScreen: { backgroundColor: 'transparent' }, createOrderBody: { flex: 1, minHeight: 0 }, createOrderSheet: { height: '92%', paddingHorizontal: 0, paddingTop: 0 }, createOrderSheetHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, createOrderSheetTitle: { flex: 1 }, createOrderSheetTitleText: { fontSize: fontSize.heading, fontWeight: fontWeight.bold }, createOrderSheetScroll: { flex: 1 }, sourcePickerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, sourcePickerField: { flex: 1 }, optionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, optionMainText: { flex: 1 }, optionType: { fontSize: fontSize.caption, textTransform: 'capitalize' },
});
