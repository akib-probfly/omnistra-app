import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Check, ChevronDown, Minus, Package, Plus, Search, Trash2, Truck, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchChannels } from '../api/channels';
import { fetchMyWorkspaces } from '../api/workspaces';
import { getCourierDeliveryFees, getCourierDeliveryZone, listCourierConnections } from '../api/couriers';
import { createOrder, fetchOrderForEdit, listOrderAreas, listOrderCities, listOrderZones, updateOrder, type OrderLocationOption } from '../api/orders';
import { listProducts, type ProductResponse, type ProductVariant } from '../api/products';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { ChannelLogo } from '../components/ChannelLogo';
import { IntegrationLogo } from '../components/IntegrationLogo';
import { sanitizeMoneyInput } from '../lib/numeric-input';
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

function productHasVariants(product: ProductResponse) {
  return product.hasVariants || product.variants.some((variant) => variant.isActive);
}

const BENGALI_LOCATION_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['\u09B2\u0995\u09CD\u09B7\u09CD\u09AE\u09C0\u09AA\u09C1\u09B0', 'lakshmipur'],
  ['\u099A\u099F\u09CD\u099F\u0997\u09CD\u09B0\u09BE\u09AE', 'chattogram'],
  ['\u099A\u09BF\u099F\u09BE\u0997\u09BE\u0982', 'chittagong'],
  ['\u09A2\u09BE\u0995\u09BE \u09B6\u09B9\u09B0', 'dhaka city'],
  ['\u09A2\u09BE\u0995\u09BE', 'dhaka'],
  ['\u09A8\u09BE\u09B0\u09BE\u09AF\u09BC\u09A3\u0997\u099E\u09CD\u099C', 'narayanganj'],
  ['\u0997\u09BE\u099C\u09C0\u09AA\u09C1\u09B0', 'gazipur'],
  ['\u0995\u09C1\u09AE\u09BF\u09B2\u09CD\u09B2\u09BE', 'cumilla'],
  ['\u09B8\u09BF\u09B2\u09C7\u099F', 'sylhet'],
  ['\u0996\u09C1\u09B2\u09A8\u09BE', 'khulna'],
  ['\u09B0\u09BE\u099C\u09B6\u09BE\u09B9\u09C0', 'rajshahi'],
  ['\u09AC\u09B0\u09BF\u09B6\u09BE\u09B2', 'barishal'],
  ['\u09AE\u09AF\u09BC\u09AE\u09A8\u09B8\u09BF\u0982\u09B9', 'mymensingh'],
  ['\u09B0\u0982\u09AA\u09C1\u09B0', 'rangpur'],
  ['\u09AC\u0997\u09C1\u09DC\u09BE', 'bogura'],
  ['\u0995\u09C1\u09B7\u09CD\u099F\u09BF\u09AF\u09BC\u09BE', 'kushtia'],
  ['\u09AF\u09B6\u09CB\u09B0', 'jashore'],
  ['\u09AB\u09C7\u09A8\u09C0', 'feni'],
];

const BENGALI_LETTERS: Record<number, string> = {
  0x0985: 'a', 0x0986: 'a', 0x0987: 'i', 0x0988: 'i', 0x0989: 'u', 0x098A: 'u', 0x098B: 'ri', 0x098F: 'e', 0x0990: 'oi', 0x0993: 'o', 0x0994: 'ou',
  0x0995: 'k', 0x0996: 'kh', 0x0997: 'g', 0x0998: 'gh', 0x0999: 'ng', 0x099A: 'ch', 0x099B: 'chh', 0x099C: 'j', 0x099D: 'jh', 0x099E: 'n', 0x099F: 't', 0x09A0: 'th', 0x09A1: 'd', 0x09A2: 'dh', 0x09A3: 'n', 0x09A4: 't', 0x09A5: 'th', 0x09A6: 'd', 0x09A7: 'dh', 0x09A8: 'n', 0x09AA: 'p', 0x09AB: 'f', 0x09AC: 'b', 0x09AD: 'bh', 0x09AE: 'm', 0x09AF: 'y', 0x09B0: 'r', 0x09B2: 'l', 0x09B6: 'sh', 0x09B7: 'sh', 0x09B8: 's', 0x09B9: 'h',
  0x09BE: 'a', 0x09BF: 'i', 0x09C0: 'i', 0x09C1: 'u', 0x09C2: 'u', 0x09C3: 'ri', 0x09C7: 'e', 0x09C8: 'oi', 0x09CB: 'o', 0x09CC: 'ou', 0x09CE: 't', 0x09DC: 'r', 0x09DD: 'rh', 0x09DF: 'y', 0x09E0: 'ri', 0x09E1: 'ri', 0x09E6: '0', 0x09E7: '1', 0x09E8: '2', 0x09E9: '3', 0x09EA: '4', 0x09EB: '5', 0x09EC: '6', 0x09ED: '7', 0x09EE: '8', 0x09EF: '9',
};

function normalizeLocation(value: string) {
  let normalized = value;
  for (const [source, alias] of BENGALI_LOCATION_ALIASES) normalized = normalized.split(source).join(alias);
  const characters = Array.from(normalized);
  let transliterated = '';
  characters.forEach((character, index) => {
    const code = character.codePointAt(0)!;
    if (code === 0x09CD || code === 0x200C || code === 0x200D) return;
    const letter = BENGALI_LETTERS[code];
    if (!letter) { transliterated += character; return; }
    transliterated += letter;
    const isConsonant = code >= 0x0995 && code <= 0x09B9 && code !== 0x09B1 && code !== 0x09B3 && code !== 0x09B5;
    const next = characters[index + 1]?.codePointAt(0);
    const hasVowelSign = next !== undefined && next >= 0x09BE && next <= 0x09CC;
    if (isConsonant && !hasVowelSign && next !== 0x09CD) transliterated += 'a';
  });
  return transliterated.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findCityInAddress(address: string, cities: OrderLocationOption[]) {
  const normalizedAddress = normalizeLocation(address);
  const segments = address.split(/[\n,]+/).map(normalizeLocation);
  return cities
    .map((city) => ({ city, normalizedName: normalizeLocation(city.name), position: normalizedAddress.indexOf(normalizeLocation(city.name)) }))
    .filter(({ normalizedName }) => normalizedName.length >= 2 && normalizedAddress.includes(normalizedName))
    .sort((left, right) => Number(segments.includes(right.normalizedName)) - Number(segments.includes(left.normalizedName)) || left.position - right.position || right.normalizedName.length - left.normalizedName.length)[0]?.city ?? null;
}

function getAddressSearchTerms(address: string) {
  const terms = new Set<string>();
  for (const segment of address.split(/[\n,]+/)) {
    const trimmed = segment.trim();
    if (trimmed.length < 2) continue;
    terms.add(trimmed);
    const normalized = normalizeLocation(trimmed);
    if (normalized.length >= 2) terms.add(normalized);
    for (const token of normalized.split(' ')) if (token.length >= 2 && !/^\d+$/.test(token)) terms.add(token);
  }
  return [...terms].slice(0, 12);
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
  const editOrderId = route.params?.editOrderId;
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
  const [amountToCollect, setAmountToCollect] = useState('');
  const [amountToCollectEdited, setAmountToCollectEdited] = useState(false);
  const [recipientName, setRecipientName] = useState(initialRecipient?.name ?? '');
  const [recipientPhone, setRecipientPhone] = useState(initialRecipient?.phone ?? '');
  const [recipientEmail, setRecipientEmail] = useState(initialRecipient?.email ?? '');
  const [address, setAddress] = useState(initialRecipient?.address ?? '');
  const [productSearch, setProductSearch] = useState('');
  const productSearchRef = useRef<TextInput>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [debouncedLocationSearch, setDebouncedLocationSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductResponse | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [customProductMode, setCustomProductMode] = useState(false);
  const [customProductName, setCustomProductName] = useState('');
  const [customVariantLabel, setCustomVariantLabel] = useState('');
  const [variationError, setVariationError] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0.00');
  const [weightKg, setWeightKg] = useState('0.00');
  const [cart, setCart] = useState<CartItem[]>(() => (route.params?.initialItems ?? []).map((item, index) => ({
    id: `draft-${index}-${item.productId}`,
    product: { id: item.productId } as ProductResponse,
    productVariantId: null,
    variantLabel: null,
    name: item.name,
    imageUrl: item.imageUrl ?? null,
    quantity: item.quantity,
    unitPrice: ((item.unitPriceMinor ?? 0) / 100).toFixed(2),
    weightKg: ((item.weightGrams ?? 0) / 1000).toFixed(3),
  })));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(Boolean(editOrderId));
  const [editLoadFailed, setEditLoadFailed] = useState(false);

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
  const couriersQuery = useQuery({ queryKey: ['courier-connections'], queryFn: listCourierConnections, enabled: Boolean(workspaceQuery.data?.items?.[0]?.ecommerceEnabled) });
  const couriers = (couriersQuery.data?.items ?? []).filter((item) => item.status === 'CONNECTED');
  const selectedCourier = couriers.find((item) => item.id === courierId) ?? null;
  const citiesQuery = useQuery({ queryKey: ['order-locations', 'cities', debouncedLocationSearch], queryFn: () => listOrderCities(debouncedLocationSearch || undefined), enabled: picker === 'city', staleTime: 10 * 60_000 });
  const addressCitiesQuery = useQuery({ queryKey: ['order-locations', 'cities', 'all'], queryFn: () => listOrderCities(), enabled: Boolean(address.trim()), staleTime: 10 * 60_000 });
  const addressSearchTerms = useMemo(() => getAddressSearchTerms(address), [address]);
  const addressZoneQueries = useQueries({ queries: addressSearchTerms.map((term) => ({ queryKey: ['order-locations', 'zones', 'address', term], queryFn: () => listOrderZones(undefined, term), enabled: Boolean(address.trim()), staleTime: 10 * 60_000 })) });
  const addressZoneOptions = useMemo(() => [...new Map(addressZoneQueries.flatMap((query) => query.data?.items ?? []).map((item) => [item.id, item])).values()], [addressZoneQueries]);
  const detectedAddressZone = useMemo(() => {
    const normalizedAddress = normalizeLocation(address);
    return addressZoneOptions
      .map((zone) => ({ zone, name: normalizeLocation(zone.name), position: normalizedAddress.indexOf(normalizeLocation(zone.name)) }))
      .filter(({ name }) => name.length >= 2 && normalizedAddress.includes(name))
      .sort((left, right) => left.position - right.position || right.name.length - left.name.length)[0]?.zone ?? null;
  }, [address, addressZoneOptions]);
  const detectedCity = useMemo(() => {
    if (detectedAddressZone?.cityId && detectedAddressZone.cityName) return { id: detectedAddressZone.cityId, name: detectedAddressZone.cityName };
    return findCityInAddress(address, addressCitiesQuery.data?.items ?? []);
  }, [address, addressCitiesQuery.data?.items, detectedAddressZone]);
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
    if (!detectedCity) return;
    if (city?.id !== detectedCity.id) {
      setCity(detectedCity);
      setArea(null);
    }
    const addressZone = detectedAddressZone?.cityId === detectedCity.id ? detectedAddressZone : null;
    if ((addressZone?.id ?? null) !== (zone?.id ?? null)) {
      setZone(addressZone);
      setArea(null);
    }
  }, [city?.id, detectedAddressZone, detectedCity, zone?.id]);
  const selectedCurrency = currency.toUpperCase();
  const subtotalMinor = cart.reduce((sum, item) => sum + item.quantity * Math.round((Number.parseFloat(item.unitPrice) || 0) * 100), 0);
  const deliveryZone = getCourierDeliveryZone(city?.name || detectedCity?.name || address);
  const courierFees = getCourierDeliveryFees(selectedCourier?.providerConfig);
  const deliveryFee = !selectedCourier ? 0 : deliveryZone === 'OUTSIDE_DHAKA' ? courierFees.outsideDhaka : courierFees.insideDhaka;
  const deliveryFeeMinor = Math.round(deliveryFee * 100);
  const totalMinor = subtotalMinor + deliveryFeeMinor;
  const paidMinor = payment === 'PAID' ? totalMinor : payment === 'PARTIAL' ? Math.min(Math.max(Math.round((Number.parseFloat(partialAmount) || 0) * 100), 0), totalMinor) : 0;
  const dueMinor = Math.max(totalMinor - paidMinor, 0);
  const defaultAmountToCollectMinor = payment === 'PAID' ? 0 : dueMinor;
  const amountToCollectInputValue = amountToCollectEdited ? amountToCollect : (defaultAmountToCollectMinor / 100).toFixed(2);
  const parsedAmountToCollect = Number.parseFloat(amountToCollectInputValue);
  const amountToCollectMinor = payment === 'PAID' ? 0 : Math.max(Number.isFinite(parsedAmountToCollect) ? Math.round(parsedAmountToCollect * 100) : defaultAmountToCollectMinor, 0);
  const canSubmitOrder = cart.length > 0
    && Boolean(recipientName.trim())
    && Boolean(recipientPhone.trim())
    && Boolean(address.trim())
    && Boolean(sourceId);

  useEffect(() => {
    if (!sourceId && channels.length) setSourceId(channels[0].id);
  }, [channels, sourceId]);

  useEffect(() => {
    setSourceId(route.params?.initialSourceChannelId ?? '');
    setRecipientName(route.params?.initialRecipient?.name ?? '');
    setRecipientPhone(route.params?.initialRecipient?.phone ?? '');
    setRecipientEmail(route.params?.initialRecipient?.email ?? '');
    setAddress(route.params?.initialRecipient?.address ?? '');
    setCart((route.params?.initialItems ?? []).map((item, index) => ({
      id: `draft-${index}-${item.productId}`,
      product: { id: item.productId } as ProductResponse,
      productVariantId: null,
      variantLabel: null,
      name: item.name,
      imageUrl: item.imageUrl ?? null,
      quantity: item.quantity,
      unitPrice: ((item.unitPriceMinor ?? 0) / 100).toFixed(2),
      weightKg: ((item.weightGrams ?? 0) / 1000).toFixed(3),
    })));
  }, [route.params]);

  useEffect(() => {
    if (!editOrderId) return;
    let active = true;
    setEditLoading(true);
    setEditLoadFailed(false);
    fetchOrderForEdit(editOrderId).then((order) => {
      if (!active) return;
      setSourceId(order.sourceChannelId);
      setCourierId(order.courierConnectionId ?? '');
      setPayment(order.paymentMethod);
      setPartialAmount((order.amountPaidMinor / 100).toFixed(2));
      setAmountToCollect((order.amountToCollectMinor / 100).toFixed(2));
      setAmountToCollectEdited(true);
      setRecipientName(order.recipient.name);
      setRecipientPhone(order.recipient.phone);
      setRecipientEmail(order.recipient.email ?? '');
      setAddress(order.recipient.address);
      setCity(order.recipient.city);
      setZone(order.recipient.zone);
      setArea(order.recipient.area);
      setCart(order.items.map((item, index) => ({
        id: `edit-${index}-${item.productId ?? 'manual'}`,
        product: item.productId ? { id: item.productId } as ProductResponse : null,
        productVariantId: item.productVariantId,
        variantLabel: item.variantLabel,
        name: item.name,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: (item.unitPriceMinor / 100).toFixed(2),
        weightKg: ((item.weightGrams ?? 0) / 1000).toFixed(3),
      })));
    }).catch((cause: unknown) => {
      if (active) {
        setEditLoadFailed(true);
        setError(cause instanceof Error ? cause.message : 'Could not load this order.');
      }
    }).finally(() => { if (active) setEditLoading(false); });
    return () => { active = false; };
  }, [editOrderId]);

  useEffect(() => {
    if (couriers.some((courier) => courier.id === courierId)) return;
    setCourierId(couriers[0]?.id ?? '');
  }, [courierId, couriers]);

  const changeCartQuantity = (itemId: string, delta: number) => setCart((current) => current.map((item) => item.id === itemId ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  const removeCartItem = (itemId: string) => setCart((current) => current.filter((item) => item.id !== itemId));
  const chooseProduct = (product: ProductResponse) => {
    productSearchRef.current?.blur();
    Keyboard.dismiss();
    setSelectedProduct(product);
    setSelectedVariant(null);
    setVariationError(false);
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
    setVariationError(false);
    setUnitPrice((productVariantPrice(selectedProduct, variant) / 100).toFixed(2));
    setWeightKg(((variant.weightGrams ?? selectedProduct.weightGrams ?? 0) / 1000).toFixed(2));
  };
  const startCustomProduct = () => {
    productSearchRef.current?.blur();
    Keyboard.dismiss();
    setSelectedProduct(null);
    setSelectedVariant(null);
    setVariationError(false);
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
    productSearchRef.current?.blur();
    Keyboard.dismiss();
    const activeVariants = selectedProduct?.variants?.filter((item) => item.isActive) ?? [];
    if (!customProductMode && selectedProduct && productHasVariants(selectedProduct) && activeVariants.length === 0) {
      setVariationError(false);
      setError('This product has no active variations available.');
      return;
    }
    if (!customProductMode && selectedProduct && productHasVariants(selectedProduct) && !selectedVariant) {
      setVariationError(true);
      setError('');
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
    setVariationError(false);
    setCustomProductMode(false);
    setCustomProductName('');
    setCustomVariantLabel('');
    setError('');
    setQuantity('1');
    setUnitPrice('0.00');
    setWeightKg('0.00');
  };

  const pickerOptions: Array<{ id: string; label: string; type?: string; provider?: string; variant?: ProductVariant }> = picker === 'source'
    ? channels.map((item) => ({ id: item.id, label: item.name, type: item.type }))
    : picker === 'city' ? (citiesQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
      : picker === 'zone' ? (zonesQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
        : picker === 'area' ? (areasQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
          : picker === 'courier' ? couriers.map((item) => ({ id: item.id, label: item.displayName, provider: item.provider }))
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
    if (payment !== 'PAID' && amountToCollectEdited) numericValues.push(amountToCollect);
    if (numericValues.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      setError('Prices, weight, and payment amounts must be valid non-negative numbers.'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
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
        amountToCollectMinor,
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
      };
      if (editOrderId) await updateOrder(editOrderId, payload);
      else await createOrder(payload);
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
      {isSheetPresentation ? <View style={[styles.createOrderSheetHeader, { borderBottomColor: colors.cardBorder }]}><View style={styles.createOrderSheetTitle}><Text style={[styles.createOrderSheetTitleText, { color: colors.text }]}>{editOrderId ? 'Edit order' : 'Create order'}</Text><Text style={[styles.helper, { color: colors.textSecondary }]}>Add products and delivery details</Text></View><Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Close create order"><X color={colors.textSecondary} size={22} /></Pressable></View> : <ScreenHeader title={editOrderId ? 'Edit order' : 'Create order'} subtitle="Add products and delivery details" onBack={() => navigation.goBack()} />}
      {editLoading ? <View style={[styles.createOrderBody, { justifyContent: 'center', padding: spacing.lg }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.helper, { color: colors.textSecondary, textAlign: 'center' }]}>Loading order details…</Text></View> : null}
      {!editLoading && !editLoadFailed ? <FormScrollView style={isSheetPresentation ? styles.createOrderSheetScroll : undefined} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.xxxl) }]} keyboardShouldPersistTaps="handled">
        <AppCard style={styles.card}>
          <View style={styles.sectionHeading}><Package color={colors.primary} size={18} /><Text style={[styles.sectionTitle, { color: colors.text }]}>Products</Text></View>
          <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Search color={colors.textMuted} size={17} />
            <TextInput
              ref={productSearchRef}
              value={productSearch}
              onChangeText={(value) => {
                setProductSearch(value);
                setProductPickerOpen(true);
                setCustomProductMode(false);
                setSelectedProduct(null);
                setSelectedVariant(null);
              }}
              onFocus={() => setProductPickerOpen(true)}
              onBlur={() => setTimeout(() => setProductPickerOpen(false), 120)}
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
            {selectedProduct?.hasVariants || (selectedProduct?.variants ?? []).some((item) => item.isActive) ? <><PickerButton label="Variation *" value={selectedVariant ? productVariantLabel(selectedVariant) : 'Select a variation'} onPress={() => setPicker('variant')} disabled={!((selectedProduct?.variants ?? []).some((item) => item.isActive))} />{variationError && !selectedVariant ? <Text style={[styles.helper, { color: colors.error }]}>Select a product variation before adding it to the cart.</Text> : null}</> : null}
            {selectedProduct?.hasVariants && !(selectedProduct.variants ?? []).some((item) => item.isActive) ? <Text style={[styles.helper, { color: colors.error }]}>This product has no active variations available.</Text> : null}
            {customProductMode ? <AppTextField label="Variant details (optional)" value={customVariantLabel} onChangeText={setCustomVariantLabel} placeholder="e.g. Size: Large" /> : null}
            <View style={styles.editableFields}><AppTextField style={styles.editableField} label={`Unit price (${selectedCurrency})`} value={unitPrice} onChangeText={(value) => setUnitPrice(sanitizeMoneyInput(value))} keyboardType="decimal-pad" inputMode="decimal" /><AppTextField style={styles.editableField} label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" /></View>
            <AppTextField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
            <AppButton block label="Add to cart" icon={Plus} onPress={addProduct} />
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Weight is used for shipping calculations.</Text>
          </View> : null}
          <View style={[styles.cartHeader, { borderTopColor: colors.cardBorder }]}><Text style={[styles.cartTitle, { color: colors.text }]}>Cart items ({cart.length})</Text><Text style={[styles.helper, { color: colors.textSecondary }]}>{cart.reduce((sum, item) => sum + item.quantity, 0)} pcs</Text></View>
          {!cart.length ? <Text style={[styles.helper, { color: colors.textMuted }]}>No products added yet.</Text> : cart.map((item) => <View key={item.id} style={[styles.cartRow, { borderBottomColor: colors.cardBorder }]}>
            {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productImage} contentFit="cover" /> : <View style={[styles.productImage, styles.productImagePlaceholder, { backgroundColor: colors.primarySoft }]}><Package color={colors.primary} size={18} /></View>}
            <View style={styles.productCopy}><Text style={[styles.productName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>{item.variantLabel ? <Text style={[styles.helper, { color: colors.textMuted }]}>{item.variantLabel}</Text> : null}<Text style={[styles.helper, { color: colors.textSecondary }]}>{formatMoney(Math.round(Number(item.unitPrice) * 100), selectedCurrency)} each</Text></View>
            <View style={[styles.quantityControl, { borderColor: colors.cardBorder }]}><Pressable onPress={() => changeCartQuantity(item.id, -1)} accessibilityLabel={`Decrease ${item.name} quantity`}><Minus color={colors.textSecondary} size={15} /></Pressable><Text style={[styles.quantityValue, { color: colors.text }]}>{item.quantity}</Text><Pressable onPress={() => changeCartQuantity(item.id, 1)} accessibilityLabel={`Increase ${item.name} quantity`}><Plus color={colors.textSecondary} size={15} /></Pressable></View>
            <Pressable onPress={() => removeCartItem(item.id)} style={styles.removeCartButton} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.name} from order`}><Trash2 color={colors.error} size={17} /></Pressable>
          </View>)}
          <View style={[styles.summary, { borderTopColor: colors.cardBorder }]}>
            <SummaryLine label="Subtotal" value={formatMoney(subtotalMinor, selectedCurrency)} colors={colors} />
            <SummaryLine label={selectedCourier ? `Delivery fee · ${deliveryZone === 'OUTSIDE_DHAKA' ? 'Outside Dhaka' : 'Inside Dhaka'}` : 'Delivery fee'} value={formatMoney(deliveryFeeMinor, selectedCurrency)} colors={colors} />
            <SummaryLine label="Total" value={formatMoney(totalMinor, selectedCurrency)} strong colors={colors} />
            <SummaryLine label="Due on delivery" value={formatMoney(amountToCollectMinor, selectedCurrency)} colors={colors} />
          </View>
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Customer information</Text>
          <AppTextField label="Name *" value={recipientName} onChangeText={setRecipientName} placeholder="Recipient name" />
          <AppTextField label="Phone *" value={recipientPhone} onChangeText={setRecipientPhone} placeholder="Phone number" keyboardType="phone-pad" />
          <AppTextField label="Email (optional)" value={recipientEmail} onChangeText={setRecipientEmail} placeholder="recipient@example.com" keyboardType="email-address" autoCapitalize="none" />
          <AppTextField label="Address *" value={address} onChangeText={setAddress} placeholder="Street, building, area details" multiline numberOfLines={3} />
          <View style={styles.locationHeading}><Text style={[styles.helper, { color: colors.textSecondary }]}>City &amp; zone (optional)</Text></View>
          <View style={styles.locationFieldsRow}>
            <View style={styles.locationFieldColumn}><PickerButton compact label="City" value={city?.name ?? detectedCity?.name ?? 'City'} onPress={() => openPicker('city')} /></View>
            <View style={styles.locationFieldColumn}><PickerButton compact label="Zone" value={zone?.name ?? 'Zone'} onPress={() => openPicker('zone')} disabled={!city} /></View>
          </View>
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment</Text>
          <View style={styles.paymentOptions}>{([['COD', 'Cash on delivery'], ['PAID', 'Paid'], ['PARTIAL', 'Partial']] as const).map(([value, label]) => {
            const selected = payment === value;
            return <Pressable key={value} onPress={() => setPayment(value)} style={[styles.paymentOption, { borderColor: selected ? colors.primary : colors.cardBorder, backgroundColor: selected ? colors.primarySoft : colors.surface }]} accessibilityRole="radio" accessibilityState={{ selected }}><Text style={[styles.paymentText, { color: selected ? colors.primary : colors.textSecondary }]}>{label}</Text>{selected ? <Check color={colors.primary} size={14} /> : null}</Pressable>;
          })}</View>
          {payment === 'PARTIAL' ? <AppTextField label="Amount paid now" value={partialAmount} onChangeText={(value) => setPartialAmount(sanitizeMoneyInput(value))} keyboardType="decimal-pad" inputMode="decimal" placeholder="0.00" /> : null}
          {payment !== 'PAID' ? <View style={[styles.amountToCollectCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <AppTextField
              label="Amount to collect"
              value={amountToCollectInputValue}
              onChangeText={(value) => { setAmountToCollectEdited(true); setAmountToCollect(sanitizeMoneyInput(value)); }}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0.00"
            />
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Courier will collect: <Text style={[styles.amountToCollectValue, { color: colors.text }]}>{formatMoney(amountToCollectMinor, selectedCurrency)}</Text>{amountToCollectMinor < totalMinor ? ` (original total ${formatMoney(totalMinor, selectedCurrency)})` : ''}</Text>
          </View> : null}
        </AppCard>

        <AppCard style={styles.card}>
          <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Order source *</Text></View>
          {channelsQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : channels.length ? (
            <View style={styles.pickerField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Connected sales channel</Text>
              <View style={styles.sourcePickerRow}>
                <ChannelLogo type={selectedSource?.type} box={38} glyph={19} radius={12} />
                <Pressable onPress={() => openPicker('source')} style={[styles.sourcePickerButton, { backgroundColor: colors.surface, borderColor: colors.inputBorder }]}>
                  <Text style={[styles.sourcePickerName, { color: colors.text }]} numberOfLines={1}>{selectedSource?.name ?? 'Select a source'}</Text>
                  <ChevronDown color={colors.textMuted} size={17} />
                </Pressable>
              </View>
            </View>
          ) : <AppText variant="small" tone="secondary">No connected sales channels are available for orders.</AppText>}
        </AppCard>

        <AppCard style={styles.card}>
          <View style={styles.sectionHeading}><Truck color={colors.primary} size={18} /><Text style={[styles.sectionTitle, { color: colors.text }]}>Delivery partner</Text><Text style={[styles.helper, { color: colors.textMuted }]}>Optional</Text></View>
          {couriersQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : couriers.length ? (
            <View style={styles.pickerField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Delivery partner</Text>
              <View style={styles.sourcePickerRow}>
                {selectedCourier ? <IntegrationLogo integrationId={selectedCourier.provider} size={38} /> : <View style={[styles.deliveryPartnerPlaceholder, { backgroundColor: colors.surfaceSecondary }]}><Truck color={colors.textMuted} size={18} /></View>}
                <Pressable onPress={() => openPicker('courier')} style={[styles.sourcePickerButton, { backgroundColor: colors.surface, borderColor: colors.inputBorder }]}>
                  <Text style={[styles.sourcePickerName, { color: selectedCourier ? colors.text : colors.textMuted }]} numberOfLines={1}>{selectedCourier?.displayName ?? 'Select a delivery partner'}</Text>
                  <ChevronDown color={colors.textMuted} size={17} />
                </Pressable>
              </View>
            </View>
          ) : <Text style={[styles.helper, { color: colors.textSecondary }]}>No delivery partners connected. Connect one from Integrations to book shipments.</Text>}
        </AppCard>
        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <AppButton block label={editOrderId ? 'Save order' : 'Create order'} loading={saving} disabled={saving || editLoading || !canSubmitOrder} onPress={() => void save()} />
      </FormScrollView> : editLoadFailed ? <View style={[styles.createOrderBody, { justifyContent: 'center', padding: spacing.lg, gap: spacing.md }]}><Text style={[styles.error, { color: colors.error }]}>{error || 'Could not load this order.'}</Text><AppButton label="Close" variant="secondary" onPress={() => navigation.goBack()} /></View> : null}
      <BottomSheet visible={Boolean(picker)} onClose={closePicker} sheetStyle={styles.pickerSheet}>
        <View style={styles.pickerContent}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{pickerTitle}</Text>
          {picker === 'city' || picker === 'zone' || picker === 'area' ? <View style={[styles.locationSearch, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}><Search color={colors.textMuted} size={16} /><TextInput value={locationSearch} onChangeText={setLocationSearch} placeholder={`Search ${picker}...`} placeholderTextColor={colors.textMuted} style={[styles.locationSearchInput, { color: colors.text }]} /></View> : null}
          <SheetScrollView style={styles.pickerOptionList} contentContainerStyle={styles.pickerOptionContent} keyboardShouldPersistTaps="handled">
            {pickerLoading ? <ActivityIndicator color={colors.primary} style={styles.pickerLoading} /> : pickerOptions.length ? pickerOptions.map((option) => <Pressable key={option.id || 'none'} onPress={() => choose(option.id)} style={[styles.option, styles.optionRow, { borderBottomColor: colors.cardBorder }]}>{picker === 'source' ? <ChannelLogo type={option.type} box={36} glyph={18} radius={11} /> : picker === 'courier' && option.provider ? <IntegrationLogo integrationId={option.provider} size={36} /> : null}<Text style={[styles.optionLabel, styles.optionMainText, { color: colors.text }]}>{option.label}</Text>{picker === 'source' ? <Text style={[styles.optionType, { color: colors.textMuted }]}>{option.type}</Text> : null}</Pressable>) : <Text style={[styles.helper, { color: colors.textMuted, paddingVertical: spacing.md, textAlign: 'center' }]}>No matching options found.</Text>}
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

function PickerButton({ label, value, onPress, disabled = false, compact = false }: { label: string; value: string; onPress: () => void; disabled?: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  return <View style={compact ? styles.locationCompactField : styles.pickerField}>{!compact ? <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text> : null}<Pressable disabled={disabled} onPress={onPress} style={[compact ? styles.locationSelectButton : styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.inputBorder }, disabled && styles.dim]} accessibilityRole="button" accessibilityLabel={`Choose ${label.toLowerCase()}`}><Text numberOfLines={1} style={[compact && styles.locationSelectText, { color: disabled ? colors.textMuted : colors.text }]}>{value}</Text>{compact ? <ChevronDown color={disabled ? colors.textMuted : colors.textSecondary} size={16} /> : null}</Pressable></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { gap: spacing.md, padding: spacing.lg }, card: { gap: spacing.md }, sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, sectionTitle: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold }, removeCartButton: { alignItems: 'center', height: 32, justifyContent: 'center', width: 28 },
  search: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md }, searchInput: { flex: 1, fontSize: fontSize.body, height: 46 }, searchResults: { borderRadius: radius.md, borderWidth: 1, maxHeight: 250, overflow: 'hidden' }, searchResultList: { maxHeight: 202 }, searchState: { padding: spacing.lg }, searchStateText: { padding: spacing.md, textAlign: 'center' }, productResult: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, padding: spacing.sm }, productImage: { borderRadius: radius.sm, height: 42, width: 42 }, productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' }, productCopy: { flex: 1, minWidth: 0 }, productName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold }, productPrice: { fontSize: fontSize.small, fontWeight: fontWeight.bold }, helper: { fontSize: fontSize.small }, selectedProduct: { borderRadius: radius.md, gap: spacing.sm, padding: spacing.md }, selectedProductHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, editableFields: { flexDirection: 'row', gap: spacing.sm }, editableField: { flex: 1, minWidth: 0 }, cartHeader: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.md }, cartTitle: { fontSize: fontSize.body, fontWeight: fontWeight.semibold }, cartRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm }, quantityControl: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, quantityValue: { fontSize: fontSize.small, fontWeight: fontWeight.bold, minWidth: 18, textAlign: 'center' }, summary: { borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingTop: spacing.md }, currencyLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }, currencyValue: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, marginTop: 2 }, summaryLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, summaryLabel: { fontSize: fontSize.caption }, summaryValue: { fontSize: fontSize.caption, fontVariant: ['tabular-nums'] }, summaryTotal: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.xs, paddingTop: spacing.sm }, summaryStrong: { fontSize: fontSize.body, fontWeight: fontWeight.bold }, deliveryFeeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, deliveryFeeInput: { borderRadius: radius.sm, borderWidth: 1, minWidth: 100, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: 'right' },
  amountToCollectCard: { borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, marginTop: spacing.xs, padding: spacing.md }, amountToCollectValue: { fontWeight: fontWeight.bold }, pickerField: { gap: spacing.xs }, fieldLabel: { fontSize: fontSize.small, fontWeight: fontWeight.semibold }, pickerButton: { borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.md }, dim: { opacity: 0.5 }, locationHeading: { gap: 2, marginTop: spacing.xs }, locationFieldsRow: { flexDirection: 'row', gap: spacing.sm }, locationFieldColumn: { flex: 1, minWidth: 0 }, locationCompactField: { flex: 1 }, locationSelectButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, height: 42, justifyContent: 'space-between', paddingHorizontal: spacing.md }, locationSelectText: { flex: 1, fontSize: fontSize.caption, minWidth: 0 }, locationSearch: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md }, locationSearchInput: { flex: 1, fontSize: fontSize.body, height: 44 }, paymentOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, paymentOption: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, paymentText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold }, error: { fontSize: fontSize.caption }, pickerSheet: { height: '75%', paddingHorizontal: spacing.lg, paddingTop: 0 }, pickerContent: { flex: 1, gap: spacing.md, minHeight: 0 }, pickerOptionList: { flex: 1 }, pickerOptionContent: { paddingBottom: spacing.md }, pickerLoading: { padding: spacing.xl }, option: { borderBottomWidth: 1, paddingVertical: spacing.md }, optionLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
  transparentScreen: { backgroundColor: 'transparent' }, createOrderBody: { flex: 1, minHeight: 0 }, createOrderSheet: { height: '92%', paddingHorizontal: 0, paddingTop: 0 }, createOrderSheetHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, createOrderSheetTitle: { flex: 1 }, createOrderSheetTitleText: { fontSize: fontSize.heading, fontWeight: fontWeight.bold }, createOrderSheetScroll: { flex: 1 }, sourcePickerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, sourcePickerButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', minHeight: 46, paddingHorizontal: spacing.md }, sourcePickerName: { flex: 1, fontSize: fontSize.body }, deliveryPartnerPlaceholder: { alignItems: 'center', borderRadius: radius.md, height: 38, justifyContent: 'center', width: 38 }, optionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, optionMainText: { flex: 1 }, optionType: { fontSize: fontSize.caption, textTransform: 'capitalize' },
});
