import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { CalendarDays, Check, ChevronRight, Copy, CreditCard, ExternalLink, Filter, Hash, MapPin, Package, Phone, Plus, QrCode, RefreshCw, Search, Share2, ShoppingBag, Truck, UserRound, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { fetchChannels } from '../api/channels';
import { bookCourierShipment, listCourierConnections, listOrderShipments, syncCourierShipment, type CourierShipment } from '../api/couriers';
import { bulkUpdateOrderStatus, getAllowedOrderStatusTransitions, listOrderInvoices, listOrders, scanOrder, updateOrderStatus, type OrderStatus, type OrderSummary } from '../api/orders';
import { ErrorState } from '../components/ErrorState';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { ChannelLogo } from '../components/ChannelLogo';
import { FormSkeleton } from '../components/Skeleton';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, inputHeight, radius, spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppCard, AppChip, AppText, ScreenHeader } from '../ui';

const STATUSES: Array<OrderStatus | 'ALL'> = ['ALL', 'PENDING', 'APPROVED', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'RETURNED', 'DAMAGED'];
const ORDER_FILTER_LAYERS = [
  { id: 'status', label: 'Status' },
  { id: 'phone', label: 'Phone' },
  { id: 'source', label: 'Source' },
] as const;
type OrderFilterLayer = (typeof ORDER_FILTER_LAYERS)[number]['id'];
function formatTotal(value: number, currency = 'BDT') { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
function formatOrderDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
function statusTone(status: OrderStatus) { return status === 'DELIVERED' ? 'success' as const : status === 'CANCELLED' || status === 'DAMAGED' ? 'danger' as const : status === 'RETURNED' ? 'neutral' as const : 'warning' as const; }
function orderStatusLabel(status: OrderStatus) { return status === 'PROCESSING' ? 'Approved' : status.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
function shipmentTone(status: string) { const normalized = status.toUpperCase(); return normalized === 'DELIVERED' ? 'success' as const : ['CANCELLED', 'RETURNED', 'FAILED', 'EXCEPTION'].includes(normalized) ? 'danger' as const : ['IN_TRANSIT', 'BOOKED', 'PARTIALLY_DELIVERED'].includes(normalized) ? 'info' as const : 'warning' as const; }

export function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [search, setSearch] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filterLayer, setFilterLayer] = useState<OrderFilterLayer>('status');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftStatus, setDraftStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [draftSourceIds, setDraftSourceIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null);
  const [courierPickerOpen, setCourierPickerOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [cameraScanArmed, setCameraScanArmed] = useState(true);
  const scanInFlight = useRef(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const ordersQuery = useQuery({
    queryKey: ['orders', status, search, phone, sourceIds, page],
    queryFn: () => listOrders({ search: search.trim() || undefined, phone: phone.trim() || undefined, source: sourceIds.length ? sourceIds : undefined, status: status === 'ALL' ? undefined : status, page, limit: 25 }),
  });
  const channelsQuery = useQuery({ queryKey: ['channels'], queryFn: fetchChannels });
  const courierQuery = useQuery({ queryKey: ['courier-connections'], queryFn: listCourierConnections, enabled: courierPickerOpen });
  const shipmentQuery = useQuery({ queryKey: ['order-shipments', selectedOrder?.id], queryFn: () => listOrderShipments(selectedOrder!.id), enabled: Boolean(selectedOrder?.id) });
  const invoiceQuery = useQuery({ queryKey: ['order-invoice', selectedOrder?.id], queryFn: () => listOrderInvoices([selectedOrder!.id]), enabled: invoiceOpen && Boolean(selectedOrder?.id) });
  const orders = useMemo(() => ordersQuery.data?.items ?? [], [ordersQuery.data]);
  const total = ordersQuery.data?.total ?? 0;
  const statusMutation = useMutation({
    mutationFn: ({ orderId, next }: { orderId: string; next: OrderStatus }) => updateOrderStatus(orderId, next),
    onSuccess: async (result) => { setSelectedOrder((current) => current?.id === result.id ? { ...current, status: result.status } : current); await queryClient.invalidateQueries({ queryKey: ['orders'] }); },
  });
  const bulkMutation = useMutation({
    mutationFn: (next: OrderStatus) => bulkUpdateOrderStatus(selectedIds, next),
    onSuccess: async () => { setSelectedIds([]); await queryClient.invalidateQueries({ queryKey: ['orders'] }); },
  });
  const bookingMutation = useMutation({
    mutationFn: ({ orderId, connectionId }: { orderId: string; connectionId: string }) => bookCourierShipment(orderId, { courierConnectionId: connectionId }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['orders'] }); await queryClient.invalidateQueries({ queryKey: ['order-shipments', selectedOrder?.id] }); setCourierPickerOpen(false); },
  });
  const syncShipmentMutation = useMutation({
    mutationFn: syncCourierShipment,
    onSuccess: async (updatedShipment) => {
      queryClient.setQueryData<{ items: CourierShipment[] }>(
        ['order-shipments', selectedOrder?.id],
        (current) => ({ items: (current?.items ?? []).map((shipment) => shipment.id === updatedShipment.id ? updatedShipment : shipment) }),
      );
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order-shipments', selectedOrder?.id] });
      Alert.alert('Courier status updated', 'The latest courier status has been synchronized.');
    },
    onError: (error: Error) => Alert.alert('Could not sync courier status', error.message),
  });
  const scanMutation = useMutation({
    mutationFn: scanOrder,
    onSuccess: async (result) => { scanInFlight.current = false; setScanMessage(''); setSelectedOrder(result.order); setScanOpen(false); setScanCode(''); Alert.alert('Order scan', result.message); await queryClient.invalidateQueries({ queryKey: ['orders'] }); },
    onError: (error: Error) => { scanInFlight.current = false; setScanMessage(error.message); },
  });
  const shareInvoice = async () => {
    const invoice = invoiceQuery.data?.items[0];
    if (!invoice) return;
    try {
      const safe = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
      const rows = invoice.items.map((item) => `<tr><td>${safe(item.name)}</td><td>${item.qty}</td><td>${formatTotal(item.unitPrice, invoice.currency)}</td><td>${formatTotal(item.amount, invoice.currency)}</td></tr>`).join('');
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Invoice ${safe(invoice.orderNumber)}</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:28px}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px 4px}aside{margin-top:20px;text-align:right;line-height:1.8}</style></head><body><h1>Zurvis order invoice</h1><p><strong>${safe(invoice.orderNumber)}</strong> · ${safe(invoice.createdAt)}</p><p>${safe(invoice.recipient.name)}<br>${safe(invoice.recipient.phone)}<br>${safe(invoice.recipient.address)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><aside>Subtotal: ${formatTotal(invoice.subtotal, invoice.currency)}<br>Discount: ${formatTotal(invoice.discount, invoice.currency)}<br>Delivery: ${formatTotal(invoice.deliveryFee, invoice.currency)}<br>Paid: ${formatTotal(invoice.amountPaid, invoice.currency)}<br><strong>Total: ${formatTotal(invoice.total, invoice.currency)} · Due: ${formatTotal(invoice.dueAmount, invoice.currency)}</strong></aside></body></html>`;
      const baseUri = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseUri) throw new Error('Invoice file storage is unavailable.');
      const uri = `${baseUri}invoice-${invoice.orderNumber.replace(/[^\w.-]/g, '-')}.html`;
      await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
      await Sharing.shareAsync(uri, { dialogTitle: `Save invoice ${invoice.orderNumber}`, mimeType: 'text/html' });
    } catch (cause) { Alert.alert('Could not prepare invoice', cause instanceof Error ? cause.message : 'Please try again.'); }
  };
  const selectedOrders = orders.filter((order) => selectedIds.includes(order.id));
  const bulkOptions = STATUSES.filter((next): next is OrderStatus => next !== 'ALL' && selectedOrders.length > 0 && selectedOrders.every((order) => getAllowedOrderStatusTransitions(order.status).includes(next)));
  const activeFilterCount = Number(status !== 'ALL') + Number(Boolean(phone.trim())) + sourceIds.length;
  const draftHasFilters = draftStatus !== 'ALL' || Boolean(draftPhone.trim()) || draftSourceIds.length > 0;
  const openFilters = () => {
    setDraftStatus(status);
    setDraftPhone(phone);
    setDraftSourceIds(sourceIds);
    setFiltersVisible(true);
  };
  const resetDraftFilters = () => {
    setDraftStatus('ALL');
    setDraftPhone('');
    setDraftSourceIds([]);
  };
  const applyFilters = () => {
    setStatus(draftStatus);
    setPhone(draftPhone);
    setSourceIds(draftSourceIds);
    setSelectedIds([]);
    setPage(1);
    setFiltersVisible(false);
  };
  const submitScan = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || scanInFlight.current) return;
    scanInFlight.current = true;
    setCameraScanArmed(false);
    setScanMessage('');
    scanMutation.mutate(code);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Orders" subtitle="Manage customer orders and fulfillment" onBack={() => navigation.goBack()} right={<View style={styles.headerActions}><Pressable onPress={() => { if (!scanInFlight.current) scanMutation.reset(); setScanCode(''); setScanMessage(''); setCameraScanArmed(true); setScanOpen(true); }} style={[styles.iconButton, { backgroundColor: colors.surfaceSecondary }]} accessibilityLabel="Scan order"><QrCode color={colors.primary} size={19} /></Pressable><Pressable onPress={() => navigation.navigate('CreateOrder')} style={[styles.iconButton, { backgroundColor: colors.primary }]} accessibilityLabel="Create order"><Plus color={colors.primaryText} size={20} /></Pressable></View>} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.xxl) }]} keyboardShouldPersistTaps="handled">
        <View style={styles.searchTools}>
          <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><Search color={colors.textMuted} size={17} /><TextInput value={search} onChangeText={(value) => { setSearch(value); setPage(1); setSelectedIds([]); }} placeholder="Search order or customer" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} /></View>
          <Pressable onPress={openFilters} style={[styles.filterIconButton, { backgroundColor: colors.surface, borderColor: activeFilterCount ? colors.primary : colors.cardBorder }]} accessibilityRole="button" accessibilityLabel={activeFilterCount ? `Filters, ${activeFilterCount} active` : 'Filters'}>
            <Filter color={activeFilterCount ? colors.primary : colors.textSecondary} size={18} />
            {activeFilterCount ? <View style={[styles.filterActiveDot, { backgroundColor: colors.primary }]} /> : null}
          </Pressable>
        </View>
        <BottomSheet visible={filtersVisible} onClose={() => setFiltersVisible(false)} sheetStyle={styles.filterSheet}>
          <View style={styles.sheetHeader}><AppText variant="heading">Order filters</AppText></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterLayerTabs, { backgroundColor: colors.surfaceSecondary }]} contentContainerStyle={styles.filterLayerTabsContent}>
            {ORDER_FILTER_LAYERS.map((layer) => {
              const selectedCount = layer.id === 'status' ? Number(draftStatus !== 'ALL') : layer.id === 'phone' ? Number(Boolean(draftPhone.trim())) : draftSourceIds.length;
              const active = filterLayer === layer.id;
              return <Pressable key={layer.id} style={[styles.filterLayerTab, active && styles.filterLayerTabActive, active && { backgroundColor: colors.surface }]} onPress={() => setFilterLayer(layer.id)}><Text style={[styles.filterLayerTabText, { color: active ? colors.text : colors.textSecondary }]}>{layer.label}</Text>{selectedCount ? <Text style={[styles.filterLayerCount, { color: colors.primary, backgroundColor: `${colors.primary}18` }]}>{selectedCount}</Text> : null}</Pressable>;
            })}
          </ScrollView>
          <SheetScrollView style={styles.filterLayerBody} contentContainerStyle={styles.filterLayerContent} keyboardShouldPersistTaps="handled">
            {filterLayer === 'status' ? <View style={styles.filterChoices}>{STATUSES.map((item) => <AppChip key={item} label={item === 'ALL' ? 'All orders' : item.replace('_', ' ')} selected={draftStatus === item} onPress={() => setDraftStatus(item)} />)}</View> : null}
            {filterLayer === 'phone' ? <View style={styles.phoneFilterSection}><AppText variant="small" tone="secondary">Filter orders by customer phone number.</AppText><TextInput value={draftPhone} onChangeText={setDraftPhone} placeholder="Phone number" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.phoneSearch, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]} /></View> : null}
            {filterLayer === 'source' ? (channelsQuery.data?.items ?? []).filter((channel) => channel.status === 'CONNECTED').length ? <View style={styles.filterChoices}>{(channelsQuery.data?.items ?? []).filter((channel) => channel.status === 'CONNECTED').map((channel) => { const selected = draftSourceIds.includes(channel.id); return <Pressable key={channel.id} onPress={() => setDraftSourceIds((current) => selected ? current.filter((id) => id !== channel.id) : [...current, channel.id])} style={[styles.channelFilter, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.cardBorder }]} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}><ChannelLogo type={channel.type} box={22} glyph={12} radius={8} /><Text numberOfLines={1} style={[styles.channelFilterLabel, { color: selected ? colors.primary : colors.textSecondary }]}>{channel.name}</Text>{selected ? <Check color={colors.primary} size={14} /> : null}</Pressable>; })}</View> : <AppText variant="small" tone="muted">No connected order sources.</AppText> : null}
          </SheetScrollView>
          <Pressable style={[styles.filterReset, !draftHasFilters && styles.filterResetDisabled]} onPress={resetDraftFilters} disabled={!draftHasFilters}><Text style={[styles.filterResetText, { color: draftHasFilters ? colors.error : colors.textMuted }]}>Clear all</Text></Pressable>
          <Pressable style={[styles.filterApply, { backgroundColor: colors.primary }]} onPress={applyFilters}><Text style={[styles.filterApplyText, { color: colors.primaryText }]}>Apply filters</Text></Pressable>
        </BottomSheet>
        {selectedOrders.length ? <AppCard style={styles.bulkCard}><Text style={[styles.meta, { color: colors.text }]}>{selectedOrders.length} selected · Update all</Text><View style={styles.statusOptions}>{bulkOptions.map((next) => <AppButton key={next} label={next.replace('_', ' ')} variant="secondary" loading={bulkMutation.isPending} onPress={() => bulkMutation.mutate(next)} />)}<AppButton label="Clear" variant="ghost" onPress={() => setSelectedIds([])} /></View></AppCard> : null}
        {ordersQuery.isLoading ? <FormSkeleton fields={5} /> : ordersQuery.isError ? <ErrorState message="Could not load orders." onRetry={() => ordersQuery.refetch()} /> : orders.length ? orders.map((order) => <Pressable key={order.id} onPress={() => setSelectedOrder(order)}><OrderCard order={order} selected={selectedIds.includes(order.id)} onToggle={() => setSelectedIds((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} /></Pressable>) : <AppCard><Text style={[styles.empty, { color: colors.textMuted }]}>No orders found.</Text></AppCard>}
        <View style={styles.pagination}><AppButton label="Previous" variant="secondary" disabled={page <= 1} onPress={() => setPage((value) => Math.max(1, value - 1))} /><Text style={[styles.meta, { color: colors.textSecondary }]}>{orders.length ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total}` : '0 orders'}</Text><AppButton label="Next" variant="secondary" disabled={page * 25 >= total} onPress={() => setPage((value) => value + 1)} /></View>
      </ScrollView>

      <BottomSheet visible={Boolean(selectedOrder)} onClose={() => setSelectedOrder(null)} sheetStyle={styles.orderDetailsSheet}>
        {selectedOrder ? <View style={styles.orderDetailsContent}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.cardBorder }]}>
            <View style={[styles.orderHeaderIcon, { backgroundColor: colors.primarySoft }]}><Package color={colors.primary} size={20} /></View>
            <View style={styles.copy}>
              <View style={styles.orderTitleRow}><Text numberOfLines={1} style={[styles.modalTitle, { color: colors.text }]}>{selectedOrder.orderNumber}</Text><AppBadge size="sm" tone={statusTone(selectedOrder.status)} label={orderStatusLabel(selectedOrder.status)} /></View>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatOrderDate(selectedOrder.date)} · {selectedOrder.items.reduce((sum, item) => sum + item.qty, 0)} item{selectedOrder.items.reduce((sum, item) => sum + item.qty, 0) === 1 ? '' : 's'}</Text>
            </View>
            <Pressable onPress={() => setSelectedOrder(null)} hitSlop={8} style={[styles.orderDetailsClose, { backgroundColor: colors.surfaceSecondary }]} accessibilityRole="button" accessibilityLabel="Close order details"><X color={colors.textSecondary} size={20} /></Pressable>
          </View>
          <SheetScrollView style={styles.orderDetailsScroll} contentContainerStyle={styles.modalContent}>
            <AppCard>
              <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>Customer information</Text>
              <IconDetail icon={UserRound} value={selectedOrder.recipient.name} strong />
              <IconDetail icon={Phone} value={selectedOrder.recipient.phone} />
              <IconDetail icon={MapPin} value={selectedOrder.recipient.address} />
            </AppCard>
            <AppCard>
              <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>Source</Text>
              <View style={styles.sourceRow}><ChannelLogo type={selectedOrder.source.type} box={40} glyph={20} radius={20} /><View style={styles.copy}><Text style={[styles.name, { color: colors.text }]}>{selectedOrder.source.name}</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>{selectedOrder.source.type.toLowerCase().split('_').map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(' ')}{selectedOrder.source.displayPhoneNumber ? ` · ${selectedOrder.source.displayPhoneNumber}` : ''}</Text></View></View>
            </AppCard>
            <AppCard>
              <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>Delivery and payment</Text>
              <IconDetail icon={Truck} value={selectedOrder.courier ? `${selectedOrder.courier.partner} · ${selectedOrder.courier.tracking || 'Booking pending'} · ${selectedOrder.courier.status}` : 'Courier not assigned'} />
              <IconDetail icon={CreditCard} value={selectedOrder.recipient.payment || 'Payment pending'} />
            </AppCard>
            <AppCard>
              <Text style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>Order summary</Text>
              <View style={styles.itemRow}><Text style={[styles.meta, { color: colors.textSecondary }]}>Items total</Text><Text style={[styles.meta, { color: colors.text }]}>{formatTotal(selectedOrder.items.reduce((sum, item) => sum + item.qty * item.price, 0))}</Text></View>
              <View style={[styles.itemRow, styles.totalRow, { borderTopColor: colors.cardBorder }]}><Text style={[styles.name, { color: colors.text }]}>Total</Text><Text style={[styles.name, { color: colors.text }]}>{formatTotal(selectedOrder.total)}</Text></View>
            </AppCard>
            <AppCard>
              <View style={styles.sectionHeader}><View style={styles.copy}><Text style={[styles.sectionTitle, { color: colors.text }]}>Courier shipment</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>Consignment details and latest provider status</Text></View>{shipmentQuery.data?.items.length ? <AppBadge size="sm" tone="neutral" label={`${shipmentQuery.data.items.length} shipment${shipmentQuery.data.items.length === 1 ? '' : 's'}`} /> : null}</View>
              {shipmentQuery.isLoading ? <View style={styles.shipmentMessage}><RefreshCw color={colors.textMuted} size={16} /><Text style={[styles.meta, { color: colors.textSecondary }]}>Loading courier details...</Text></View> : null}
              {!shipmentQuery.isLoading && !shipmentQuery.data?.items.length ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{selectedOrder.courier ? 'Courier assigned. The shipment will appear after booking.' : 'No courier has been assigned to this order.'}</Text> : null}
              {shipmentQuery.data?.items.map((shipment) => <View key={shipment.id} style={[styles.shipmentCard, { borderColor: colors.cardBorder }]}>
                <View style={styles.sectionHeader}><View style={styles.copy}><Text style={[styles.name, { color: colors.text }]}>{shipment.courierName}</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>{shipment.provider ?? 'Courier'} account</Text></View><AppBadge size="sm" tone={shipmentTone(shipment.providerStatus ?? shipment.status)} label={(shipment.providerStatus ?? shipment.status).toLowerCase().split('_').map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(' ')} /></View>
                <DetailLine label="Consignment ID" value={shipment.providerShipmentId ?? ''} /><DetailLine label="Courier invoice" value={shipment.providerInvoice ?? ''} /><DetailLine label="Tracking code" value={shipment.trackingCode ?? ''} /><DetailLine label="COD amount" value={shipment.codAmount == null ? '' : formatTotal(shipment.codAmount)} /><DetailLine label="Delivery charge" value={shipment.deliveryCharge == null ? '' : formatTotal(shipment.deliveryCharge)} /><DetailLine label="Last synced" value={shipment.lastSyncedAt ? new Date(shipment.lastSyncedAt).toLocaleString() : ''} /><DetailLine label="Last webhook" value={shipment.lastWebhookAt ? new Date(shipment.lastWebhookAt).toLocaleString() : ''} />
                <View style={styles.statusOptions}>{shipment.trackingUrl ? <AppButton label="Open tracking" icon={ExternalLink} variant="secondary" onPress={() => Linking.openURL(shipment.trackingUrl!).catch(() => Alert.alert('Could not open tracking', 'Please try again.'))} /> : null}<AppButton label={syncShipmentMutation.isPending && syncShipmentMutation.variables === shipment.id ? 'Syncing...' : 'Sync status'} icon={RefreshCw} variant="secondary" loading={syncShipmentMutation.isPending && syncShipmentMutation.variables === shipment.id} disabled={!shipment.providerShipmentId || syncShipmentMutation.isPending} onPress={() => syncShipmentMutation.mutate(shipment.id)} /></View>
                {shipment.bookingErrorMessage ? <Text style={[styles.shipmentError, { color: colors.error, backgroundColor: `${colors.error}12` }]}>{shipment.bookingErrorMessage}</Text> : null}
              </View>)}
              <AppButton label="Book courier" icon={Truck} variant="secondary" onPress={() => setCourierPickerOpen(true)} />
            </AppCard>
            <AppCard>
              <View style={styles.sectionHeader}><Text style={[styles.name, { color: colors.text }]}>Items</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>{selectedOrder.items.reduce((sum, item) => sum + item.qty, 0)} total</Text></View>
              {selectedOrder.items.map((item, index) => <View key={`${item.name}-${index}`} style={styles.itemRow}><View style={styles.copy}><Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>{item.qty} × {formatTotal(item.price)}</Text></View><Text style={[styles.name, { color: colors.text }]}>{formatTotal(item.qty * item.price)}</Text></View>)}
            </AppCard>
            <AppCard><Text style={[styles.sectionTitle, { color: colors.text }]}>Update status</Text><View style={styles.statusOptions}>{getAllowedOrderStatusTransitions(selectedOrder.status).map((next) => <AppButton key={next} label={next.replace('_', ' ')} variant="secondary" loading={statusMutation.isPending} onPress={() => statusMutation.mutate({ orderId: selectedOrder.id, next })} />)}</View>{getAllowedOrderStatusTransitions(selectedOrder.status).length === 0 ? <Text style={[styles.meta, { color: colors.textSecondary }]}>This order is in a final status.</Text> : null}</AppCard>
            <AppButton label="View invoice details" variant="secondary" onPress={() => setInvoiceOpen(true)} />
            <View style={[styles.orderMetaFooter, { borderTopColor: colors.cardBorder }]}>
              <View style={styles.createdMeta}><CalendarDays color={colors.textMuted} size={15} /><Text style={[styles.meta, { color: colors.textMuted }]}>Created {formatOrderDate(selectedOrder.date)}</Text></View>
              <Pressable onPress={() => void Clipboard.setStringAsync(selectedOrder.id).then(() => Alert.alert('Copied', 'Order UUID copied.')).catch(() => Alert.alert('Could not copy order UUID', 'Please try again.'))} style={styles.orderIdMeta} accessibilityRole="button" accessibilityLabel="Copy order UUID">
                <Hash color={colors.textMuted} size={15} />
                <Text numberOfLines={1} style={[styles.meta, styles.orderIdText, { color: colors.textMuted }]}>UUID: {selectedOrder.id}</Text>
                <Copy color={colors.textMuted} size={14} />
              </Pressable>
            </View>
          </SheetScrollView>
        </View> : null}
      </BottomSheet>

      <Modal visible={courierPickerOpen} transparent animationType="slide" onRequestClose={() => setCourierPickerOpen(false)}><Pressable style={styles.scrim} onPress={() => setCourierPickerOpen(false)}><Pressable style={[styles.picker, { backgroundColor: colors.surface }]} onPress={(event) => event.stopPropagation()}><Text style={[styles.sectionTitle, { color: colors.text }]}>Choose a courier</Text>{courierQuery.isLoading ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Loading couriers…</Text> : (courierQuery.data?.items ?? []).filter((item) => item.status === 'CONNECTED').map((courier) => <Pressable key={courier.id} disabled={bookingMutation.isPending} onPress={() => selectedOrder && bookingMutation.mutate({ orderId: selectedOrder.id, connectionId: courier.id })} style={[styles.option, { borderBottomColor: colors.cardBorder }]}><Text style={[styles.optionText, { color: colors.text }]}>{courier.displayName}</Text><ChevronRight color={colors.textMuted} size={18} /></Pressable>)}{bookingMutation.isError ? <Text style={[styles.error, { color: colors.error }]}>{bookingMutation.error.message}</Text> : null}<AppButton label="Cancel" variant="secondary" onPress={() => setCourierPickerOpen(false)} /></Pressable></Pressable></Modal>

      <Modal visible={scanOpen} transparent animationType="slide" onRequestClose={() => setScanOpen(false)}><Pressable style={styles.scrim} onPress={() => setScanOpen(false)}><Pressable style={[styles.picker, styles.scanPicker, { backgroundColor: colors.surface }]} onPress={(event) => event.stopPropagation()}>
        <View style={styles.scanTitleRow}><View style={[styles.scanIcon, { backgroundColor: colors.primarySoft }]}><QrCode color={colors.primary} size={19} /></View><View style={styles.copy}><Text style={[styles.sectionTitle, { color: colors.text }]}>Scan an order</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>Scan a QR/barcode or enter its order ID.</Text></View><Pressable onPress={() => setScanOpen(false)} accessibilityLabel="Close scanner"><X color={colors.textSecondary} size={21} /></Pressable></View>
        {cameraPermission?.granted ? <View style={styles.cameraFrame}>{scanOpen && cameraScanArmed ? <><CameraView style={styles.scannerCamera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'] }} onBarcodeScanned={scanMutation.isPending ? undefined : ({ data }) => submitScan(data)} onMountError={() => { setCameraScanArmed(false); setScanMessage('Could not start the camera. Enter the code below or check camera access.'); }} /><View pointerEvents="none" style={styles.scanGuide}><View style={[styles.scanGuideBorder, { borderColor: colors.primary }]} /></View></> : <View style={[styles.cameraPaused, { backgroundColor: colors.surfaceSecondary }]}><QrCode color={colors.primary} size={26} /><Text style={[styles.meta, styles.cameraHelp, { color: colors.textSecondary }]}>Scanner paused. Resume to scan another code.</Text><AppButton label="Resume scanning" variant="secondary" onPress={() => { setScanMessage(''); setCameraScanArmed(true); }} /></View>}</View> : <View style={[styles.cameraPlaceholder, { backgroundColor: colors.surfaceSecondary }]}><QrCode color={colors.primary} size={30} /><Text style={[styles.meta, styles.cameraHelp, { color: colors.textSecondary }]}>{cameraPermission ? 'Camera access is needed to scan parcel codes.' : 'Checking camera permission...'}</Text>{cameraPermission ? <AppButton label={cameraPermission.canAskAgain ? 'Allow camera access' : 'Open settings'} variant="secondary" onPress={() => cameraPermission.canAskAgain ? void requestCameraPermission() : void Linking.openSettings().catch(() => Alert.alert('Settings unavailable', 'Enable camera access in your device settings.'))} /> : null}</View>}
        <View style={styles.scanManual}><TextInput value={scanCode} onChangeText={setScanCode} onSubmitEditing={() => submitScan(scanCode)} returnKeyType="done" placeholder="Order number or QR/barcode text" placeholderTextColor={colors.textMuted} style={[styles.phoneSearch, styles.scanInput, { backgroundColor: colors.background, borderColor: colors.cardBorder, color: colors.text }]} autoCapitalize="characters" editable={!scanMutation.isPending} /><AppButton label="Look up" loading={scanMutation.isPending} disabled={!scanCode.trim()} onPress={() => submitScan(scanCode)} /></View>
        <Text style={[styles.scanInstructions, { color: colors.textSecondary }]}>Approved orders become shipped. Scanning a shipped order again marks it returned.</Text>
        {scanMessage ? <Text style={[styles.error, { color: colors.error }]}>{scanMessage}</Text> : null}<AppButton label="Cancel" variant="secondary" onPress={() => setScanOpen(false)} />
      </Pressable></Pressable></Modal>

      <Modal visible={invoiceOpen} transparent animationType="slide" onRequestClose={() => setInvoiceOpen(false)}><Pressable style={styles.scrim} onPress={() => setInvoiceOpen(false)}><Pressable style={[styles.picker, { backgroundColor: colors.surface }]} onPress={(event) => event.stopPropagation()}><Text style={[styles.sectionTitle, { color: colors.text }]}>Invoice</Text>{invoiceQuery.isLoading ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Loading invoice…</Text> : invoiceQuery.isError ? <Text style={[styles.error, { color: colors.error }]}>Could not load invoice details.</Text> : invoiceQuery.data?.items.map((invoice) => <View key={invoice.id} style={styles.invoiceDetails}><DetailLine label="Subtotal" value={formatTotal(invoice.subtotal, invoice.currency)} /><DetailLine label="Discount" value={formatTotal(invoice.discount, invoice.currency)} /><DetailLine label="Delivery" value={formatTotal(invoice.deliveryFee, invoice.currency)} /><DetailLine label="Paid" value={formatTotal(invoice.amountPaid, invoice.currency)} /><DetailLine label="Due" value={formatTotal(invoice.dueAmount, invoice.currency)} /><DetailLine label="Total" value={formatTotal(invoice.total, invoice.currency)} /></View>)}<AppButton label="Share or save invoice" icon={Share2} disabled={!invoiceQuery.data?.items.length} onPress={() => void shareInvoice()} /><AppButton label="Close" variant="secondary" onPress={() => setInvoiceOpen(false)} /></Pressable></Pressable></Modal>
    </View>
  );
}

function OrderCard({ order, selected, onToggle }: { order: OrderSummary; selected: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const productImage = order.items.find((item) => item.imageUrl)?.imageUrl;
  return <AppCard style={styles.card}><View style={styles.header}><View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>{productImage ? <Image source={{ uri: productImage }} style={styles.productImage} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={order.items.find((item) => item.imageUrl)?.name ?? 'Order product'} /> : <ShoppingBag color={colors.primary} size={18} />}</View><View style={styles.copy}><Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{order.orderNumber} · {order.recipient.name || order.recipient.phone}</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>{order.source.name} · {new Date(order.date).toLocaleDateString()}</Text></View><AppBadge size="sm" tone={statusTone(order.status)} label={order.status} /><Pressable onPress={(event) => { event.stopPropagation(); onToggle(); }} hitSlop={8} style={[styles.selectButton, { backgroundColor: selected ? colors.primary : colors.surfaceSecondary }]} accessibilityLabel={selected ? 'Deselect order' : 'Select order'}>{selected ? <Check color={colors.primaryText} size={16} /> : null}</Pressable></View><View style={styles.summary}><Text style={[styles.total, { color: colors.text }]}>{formatTotal(order.total)}</Text><Text style={[styles.meta, { color: colors.textSecondary }]}>{order.items.length} item{order.items.length === 1 ? '' : 's'} · {order.recipient.payment || 'Payment pending'}</Text></View><Text style={[styles.address, { color: colors.textMuted }]} numberOfLines={2}>{order.recipient.address || order.recipient.phone}</Text><View style={styles.cardFooter}><Text style={[styles.meta, { color: colors.primary }]}>View order</Text><ChevronRight color={colors.primary} size={17} /></View></AppCard>;
}
function IconDetail({ icon: Icon, value, strong = false }: { icon: LucideIcon; value: string; strong?: boolean }) { const { colors } = useTheme(); return <View style={styles.iconDetail}><Icon color={colors.textMuted} size={16} /><Text style={[styles.iconDetailText, { color: strong ? colors.text : colors.textSecondary }, strong && styles.iconDetailStrong]}>{value || '—'}</Text></View>; }
function DetailLine({ label, value }: { label: string; value: string }) { const { colors } = useTheme(); return <View style={styles.detailLine}><Text style={[styles.meta, { color: colors.textSecondary }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{value || '—'}</Text></View>; }

const styles = StyleSheet.create({
  orderDetailsClose: { alignItems: 'center', borderRadius: radius.pill, height: 36, justifyContent: 'center', width: 36 },
  detailSectionTitle: { fontSize: fontSize.small, fontWeight: fontWeight.semibold, letterSpacing: 1.1, marginBottom: spacing.sm, textTransform: 'uppercase' },
  orderMetaFooter: { borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.md },
  orderIdMeta: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: spacing.xs },
  orderIdText: { flexShrink: 1 },
  screen: { flex: 1 }, content: { gap: spacing.md, padding: spacing.lg }, headerActions: { flexDirection: 'row', gap: spacing.sm }, iconButton: { alignItems: 'center', borderRadius: radius.pill, height: 38, justifyContent: 'center', width: 38 },
  searchTools: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, search: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md }, input: { flex: 1, fontSize: fontSize.body, height: inputHeight }, filterIconButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, height: inputHeight, justifyContent: 'center', position: 'relative', width: inputHeight }, filterActiveDot: { borderRadius: radius.pill, height: spacing.sm, position: 'absolute', right: 5, top: 5, width: spacing.sm },
  filterSheet: { paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 }, sheetHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.md }, filterLayerTabs: { borderRadius: radius.lg, flexGrow: 0, marginBottom: spacing.md, padding: spacing.xs }, filterLayerTabsContent: { alignItems: 'center', flexDirection: 'row', gap: 4 }, filterLayerTab: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 4, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8 }, filterLayerTabActive: { elevation: 1, shadowOpacity: 0.06, shadowRadius: 4 }, filterLayerTabText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold }, filterLayerCount: { borderRadius: 8, fontSize: 10, fontWeight: '700', marginLeft: 3, overflow: 'hidden', paddingHorizontal: 4, paddingVertical: 1 }, filterLayerBody: { maxHeight: 400 }, filterLayerContent: { paddingBottom: spacing.sm }, filterChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, phoneFilterSection: { gap: spacing.sm }, phoneSearch: { borderRadius: radius.md, borderWidth: 1, fontSize: fontSize.body, minHeight: 46, paddingHorizontal: spacing.md }, channelFilter: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, maxWidth: '100%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, channelFilterLabel: { flexShrink: 1, fontSize: fontSize.small, fontWeight: fontWeight.semibold }, filterReset: { alignItems: 'center', marginTop: 14, paddingVertical: 6 }, filterResetDisabled: { opacity: 0.45 }, filterResetText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold }, filterApply: { alignItems: 'center', borderRadius: radius.md, marginTop: spacing.sm, paddingVertical: spacing.md + 2 }, filterApplyText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  card: { gap: spacing.md }, bulkCard: { gap: spacing.sm }, header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, icon: { alignItems: 'center', borderRadius: radius.md, height: spacing.xxxl + spacing.xs, justifyContent: 'center', overflow: 'hidden', width: spacing.xxxl + spacing.xs }, productImage: { height: '100%', width: '100%' }, copy: { flex: 1, minWidth: 0 }, name: { fontSize: fontSize.body, fontWeight: fontWeight.bold }, meta: { fontSize: fontSize.small, marginTop: spacing.xs / 2 }, summary: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, total: { fontSize: fontSize.body, fontWeight: fontWeight.bold }, address: { fontSize: fontSize.small }, empty: { fontSize: fontSize.body, textAlign: 'center' }, cardFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, selectButton: { alignItems: 'center', borderRadius: radius.sm, height: 24, justifyContent: 'center', width: 24, marginLeft: spacing.xs },
  orderDetailsSheet: { height: '88%', paddingHorizontal: spacing.lg, paddingTop: 0 }, orderDetailsContent: { flex: 1, minHeight: 0 }, orderDetailsScroll: { flex: 1 }, modalHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md }, orderHeaderIcon: { alignItems: 'center', borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 }, orderTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, modalTitle: { fontSize: fontSize.heading, fontWeight: fontWeight.bold }, modalContent: { gap: spacing.md, paddingBottom: spacing.xxxl, paddingTop: spacing.md }, sectionTitle: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold, marginBottom: spacing.sm }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }, sourceRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, iconDetail: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs }, iconDetailText: { flex: 1, fontSize: fontSize.small }, iconDetailStrong: { fontWeight: fontWeight.semibold }, detailLine: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }, detailValue: { flex: 1, fontSize: fontSize.small, marginLeft: spacing.lg, textAlign: 'right' }, itemRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: spacing.sm }, itemName: { fontSize: fontSize.body, fontWeight: fontWeight.medium }, totalRow: { borderTopWidth: 1, marginTop: spacing.xs, paddingTop: spacing.md }, shipmentCard: { borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, marginVertical: spacing.sm, padding: spacing.md }, shipmentMessage: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md }, shipmentError: { borderRadius: radius.sm, fontSize: fontSize.caption, lineHeight: 18, marginTop: spacing.xs, overflow: 'hidden', padding: spacing.sm }, createdMeta: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs }, statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  scrim: { backgroundColor: '#0008', flex: 1, justifyContent: 'flex-end' }, picker: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, gap: spacing.md, maxHeight: '75%', padding: spacing.lg }, scanPicker: { maxHeight: '90%' }, scanTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, scanIcon: { alignItems: 'center', borderRadius: radius.md, height: 40, justifyContent: 'center', width: 40 }, cameraFrame: { borderRadius: radius.lg, height: 230, overflow: 'hidden', position: 'relative', width: '100%' }, scannerCamera: { height: '100%', width: '100%' }, cameraPaused: { alignItems: 'center', flex: 1, gap: spacing.sm, justifyContent: 'center', padding: spacing.lg }, scanGuide: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 }, scanGuideBorder: { aspectRatio: 1, borderRadius: radius.lg, borderWidth: 2, width: '64%' }, cameraPlaceholder: { alignItems: 'center', borderRadius: radius.lg, gap: spacing.sm, justifyContent: 'center', minHeight: 210, padding: spacing.lg }, cameraHelp: { maxWidth: 240, textAlign: 'center' }, scanManual: { gap: spacing.sm }, scanInput: { flex: 0 }, scanInstructions: { fontSize: fontSize.caption, lineHeight: 18 }, option: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md }, optionText: { fontSize: fontSize.body, fontWeight: fontWeight.medium }, error: { fontSize: fontSize.caption }, invoiceDetails: { gap: spacing.xs },
});
