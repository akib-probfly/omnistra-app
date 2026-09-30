import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { fetchChannels } from '../api/channels';
import { listCourierConnections } from '../api/couriers';
import { createOrder, listOrderAreas, listOrderCities, listOrderZones, type OrderLocationOption } from '../api/orders';
import { listProducts, type ProductResponse } from '../api/products';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard, AppTextField, ScreenHeader } from '../ui';

type Picker = 'source' | 'city' | 'zone' | 'area' | 'courier' | 'payment' | null;
type PaymentMethod = 'COD' | 'PAID' | 'PARTIAL';

export function CreateOrderScreen() {
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [picker, setPicker] = useState<Picker>(null);
  const [sourceId, setSourceId] = useState('');
  const [city, setCity] = useState<OrderLocationOption | null>(null);
  const [zone, setZone] = useState<OrderLocationOption | null>(null);
  const [area, setArea] = useState<OrderLocationOption | null>(null);
  const [courierId, setCourierId] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('COD');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [amountPaid, setAmountPaid] = useState('0');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const channelsQuery = useQuery({ queryKey: ['channels'], queryFn: fetchChannels });
  const productsQuery = useQuery({ queryKey: ['create-order-products'], queryFn: () => listProducts({ status: 'ACTIVE', page: 1, limit: 100 }) });
  const couriersQuery = useQuery({ queryKey: ['courier-connections'], queryFn: listCourierConnections });
  const citiesQuery = useQuery({ queryKey: ['order-locations', 'cities'], queryFn: () => listOrderCities(), enabled: picker === 'city' });
  const zonesQuery = useQuery({ queryKey: ['order-locations', 'zones', city?.id], queryFn: () => listOrderZones(city!.id), enabled: picker === 'zone' && Boolean(city) });
  const areasQuery = useQuery({ queryKey: ['order-locations', 'areas', zone?.id], queryFn: () => listOrderAreas(zone!.id), enabled: picker === 'area' && Boolean(zone) });
  const channels = (channelsQuery.data?.items ?? []).filter((item) => item.status === 'CONNECTED');
  const products = productsQuery.data?.items ?? [];
  const couriers = (couriersQuery.data?.items ?? []).filter((item) => item.status === 'CONNECTED');
  const selectedProducts = products.filter((product) => (quantities[product.id] ?? 0) > 0);
  const orderCurrency = selectedProducts[0]?.currency || 'BDT';

  useEffect(() => { if (!sourceId && channels.length) setSourceId(channels[0].id); }, [channels, sourceId]);
  const changeQty = (productId: string, delta: number) => setQuantities((current) => ({ ...current, [productId]: Math.max(0, (current[productId] ?? 0) + delta) }));
  const options: Array<{ id: string; label: string }> = picker === 'source'
    ? channels.map((item) => ({ id: item.id, label: `${item.name} Â· ${item.type}` }))
    : picker === 'city' ? (citiesQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
      : picker === 'zone' ? (zonesQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
        : picker === 'area' ? (areasQuery.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }))
          : picker === 'courier' ? [{ id: '', label: 'No courier selected' }, ...couriers.map((item) => ({ id: item.id, label: item.displayName }))]
            : picker === 'payment' ? ['COD', 'PAID', 'PARTIAL'].map((item) => ({ id: item, label: item === 'COD' ? 'Cash on delivery' : item === 'PAID' ? 'Paid' : 'Partially paid' })) : [];
  const pickerTitle = picker === 'source' ? 'Order source' : picker === 'city' ? 'Select city' : picker === 'zone' ? 'Select zone' : picker === 'area' ? 'Select area' : picker === 'courier' ? 'Delivery partner' : 'Payment method';
  const pickerLoading = (picker === 'city' && citiesQuery.isLoading) || (picker === 'zone' && zonesQuery.isLoading) || (picker === 'area' && areasQuery.isLoading);

  const save = async () => {
    const items = selectedProducts.map((product) => ({ productId: product.id, quantity: quantities[product.id], unitPriceMinor: product.salePriceMinor ?? product.priceMinor ?? 0, weightGrams: product.weightGrams }));
    const paid = Number(amountPaid || 0);
    const fee = Number(deliveryFee || 0);
    if (!Number.isFinite(paid) || paid < 0 || !Number.isFinite(fee) || fee < 0) { setError('Payment and delivery amounts must be valid non-negative numbers.'); return; }
    if (selectedProducts.some((product) => (product.currency || 'BDT') !== orderCurrency)) { setError('Products in one order must use the same currency.'); return; }
    if (!sourceId || !city || !zone || !area || !recipientName.trim() || !recipientPhone.trim() || !address.trim() || items.length === 0) {
      setError('Choose a source, delivery location and at least one product, then fill in recipient details.');
      return;
    }
    setSaving(true); setError('');
    try {
      await createOrder({ sourceChannelId: sourceId, courierConnectionId: courierId || null, recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim(), recipientEmail: recipientEmail.trim() || null, address: address.trim(), cityId: city.id, zoneId: zone.id, areaId: area.id, currency: orderCurrency, paymentMethod: payment, amountPaidMinor: Math.round(paid * 100), deliveryFeeMinor: Math.round(fee * 100), items });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigation.goBack();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the order.'); }
    finally { setSaving(false); }
  };

  const choose = (id: string) => {
    if (picker === 'source') setSourceId(id);
    if (picker === 'city') { const selected = citiesQuery.data?.items.find((item) => item.id === id) ?? null; setCity(selected); setZone(null); setArea(null); }
    if (picker === 'zone') { const selected = zonesQuery.data?.items.find((item) => item.id === id) ?? null; setZone(selected); setArea(null); }
    if (picker === 'area') setArea(areasQuery.data?.items.find((item) => item.id === id) ?? null);
    if (picker === 'courier') setCourierId(id);
    if (picker === 'payment') setPayment(id as PaymentMethod);
    setPicker(null);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Create order" subtitle="Add products and delivery details" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppCard>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Order details</Text>
          <PickerButton label="Source channel" value={channels.find((item) => item.id === sourceId)?.name ?? 'Choose a channel'} onPress={() => setPicker('source')} />
          <PickerButton label="Payment method" value={payment === 'COD' ? 'Cash on delivery' : payment === 'PAID' ? 'Paid' : 'Partially paid'} onPress={() => setPicker('payment')} />
          {payment === 'PARTIAL' ? <AppTextField label={`Amount paid (${orderCurrency})`} value={amountPaid} onChangeText={setAmountPaid} keyboardType="decimal-pad" /> : null}
          <AppTextField label={`Delivery fee (${orderCurrency})`} value={deliveryFee} onChangeText={setDeliveryFee} keyboardType="decimal-pad" />
          <PickerButton label="Delivery partner (optional)" value={couriers.find((item) => item.id === courierId)?.displayName ?? 'No courier selected'} onPress={() => setPicker('courier')} />
        </AppCard>
        <AppCard>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Products</Text>
          {productsQuery.isLoading ? <Text style={{ color: colors.textSecondary }}>Loading active productsâ€¦</Text> : products.length === 0 ? <Text style={{ color: colors.textSecondary }}>Create an active product before adding an order.</Text> : products.map((product) => <ProductPickerRow key={product.id} product={product} quantity={quantities[product.id] ?? 0} onChange={(delta) => changeQty(product.id, delta)} />)}
        </AppCard>
        <AppCard>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recipient</Text>
          <AppTextField label="Full name" value={recipientName} onChangeText={setRecipientName} placeholder="Customer name" />
          <AppTextField label="Phone number" value={recipientPhone} onChangeText={setRecipientPhone} placeholder="01XXXXXXXXX" keyboardType="phone-pad" />
          <AppTextField label="Email (optional)" value={recipientEmail} onChangeText={setRecipientEmail} placeholder="customer@example.com" keyboardType="email-address" autoCapitalize="none" />
          <AppTextField label="Street address" value={address} onChangeText={setAddress} placeholder="House, road, area" multiline numberOfLines={3} />
          <PickerButton label="City" value={city?.name ?? 'Choose city'} onPress={() => setPicker('city')} />
          <PickerButton label="Zone" value={zone?.name ?? 'Choose zone'} onPress={() => setPicker('zone')} disabled={!city} />
          <PickerButton label="Area" value={area?.name ?? 'Choose area'} onPress={() => setPicker('area')} disabled={!zone} />
        </AppCard>
        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <AppButton block label={saving ? 'Creatingâ€¦' : 'Create order'} loading={saving} disabled={saving || !selectedProducts.length} onPress={() => void save()} />
      </ScrollView>
      <Modal visible={Boolean(picker)} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.scrim} onPress={() => setPicker(null)}>
          <Pressable style={[styles.picker, { backgroundColor: colors.surface }]} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{pickerTitle}</Text>
            <ScrollView>{pickerLoading ? <Text style={[styles.optionLabel, { color: colors.textSecondary }]}>Loadingâ€¦</Text> : options.map((option) => <Pressable key={option.id} onPress={() => choose(option.id)} style={[styles.option, { borderBottomColor: colors.cardBorder }]}><Text style={[styles.optionLabel, { color: colors.text }]}>{option.label}</Text></Pressable>)}</ScrollView>
            <AppButton label="Close" variant="secondary" onPress={() => setPicker(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PickerButton({ label, value, onPress, disabled = false }: { label: string; value: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <View style={styles.pickerField}><Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text><Pressable disabled={disabled} onPress={onPress} style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.inputBorder }, disabled && styles.dim]}><Text style={{ color: disabled ? colors.textMuted : colors.text }}>{value}</Text></Pressable></View>;
}

function ProductPickerRow({ product, quantity, onChange }: { product: ProductResponse; quantity: number; onChange: (delta: number) => void }) {
  const { colors } = useTheme();
  const price = product.salePriceMinor ?? product.priceMinor ?? 0;
  return <View style={[styles.productRow, { borderBottomColor: colors.cardBorder }]}><View style={styles.productCopy}><Text style={[styles.optionLabel, { color: colors.text }]} numberOfLines={1}>{product.name}</Text><Text style={{ color: colors.textSecondary, fontSize: fontSize.small }}>{new Intl.NumberFormat(undefined, { style: 'currency', currency: product.currency || 'BDT' }).format(price / 100)}</Text></View><Pressable accessibilityLabel={`Remove ${product.name}`} onPress={() => onChange(-1)} style={[styles.qtyButton, { backgroundColor: colors.primarySoft }]}><Text style={{ color: colors.primary }}>âˆ’</Text></Pressable><Text style={[styles.qty, { color: colors.text }]}>{quantity}</Text><Pressable accessibilityLabel={`Add ${product.name}`} onPress={() => onChange(1)} style={[styles.qtyButton, { backgroundColor: colors.primarySoft }]}><Text style={{ color: colors.primary }}>+</Text></Pressable></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxxl }, sectionTitle: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold, marginBottom: spacing.sm }, pickerField: { gap: spacing.xs }, fieldLabel: { fontSize: fontSize.small, fontWeight: fontWeight.semibold }, pickerButton: { borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md }, dim: { opacity: 0.5 }, productRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm }, productCopy: { flex: 1, minWidth: 0 }, qtyButton: { alignItems: 'center', borderRadius: radius.pill, height: 34, justifyContent: 'center', width: 34 }, qty: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, minWidth: 20, textAlign: 'center' }, error: { fontSize: fontSize.caption }, scrim: { backgroundColor: '#0008', flex: 1, justifyContent: 'flex-end' }, picker: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, gap: spacing.md, maxHeight: '75%', padding: spacing.lg }, option: { borderBottomWidth: 1, paddingVertical: spacing.md }, optionLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium } });
