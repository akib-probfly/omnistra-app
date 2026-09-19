import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Package, ReceiptText, ShoppingBag } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fetchWhatsappProductCatalog, type WhatsappCatalogProduct } from '../api/channels';
import type { WhatsappOrder } from '../lib/inbox-utils';
import { useTheme } from '../theme/ThemeContext';

function formatPrice(amount: number | null, currency: string | null) {
  if (amount === null) return 'Price unavailable';
  const formatted = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  const code = currency?.trim().toUpperCase();
  if (code === 'BDT') return `৳${formatted}`;
  if (code === 'USD') return `$${formatted}`;
  if (code === 'EUR') return `€${formatted}`;
  if (code === 'GBP') return `£${formatted}`;
  if (code === 'INR') return `₹${formatted}`;
  return code ? `${formatted} ${code}` : formatted;
}

function formatAvailability(value: string | null) {
  return value ? value.split(/[_-]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ') : null;
}

export function WhatsappOrderCard({ order, channelId }: { order: WhatsappOrder; channelId?: string }) {
  const { colors } = useTheme();
  const queryKey = ['channels', 'product-catalog', channelId ?? 'disabled', order.catalogId ?? null] as const;
  const catalog = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchWhatsappProductCatalog(channelId as string, order.catalogId ?? undefined, pageParam, 25),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(channelId),
    staleTime: 60000,
  });
  const products = useMemo(() => catalog.data?.pages.flatMap((page) => page.products) ?? [], [catalog.data?.pages]);
  const unresolvedCount = useMemo(() => order.items.filter((item) => !products.some((product) => product.retailerId?.toLowerCase() === item.productRetailerId.toLowerCase())).length, [order.items, products]);
  useEffect(() => {
    if (unresolvedCount > 0 && catalog.hasNextPage && !catalog.isFetchingNextPage && !catalog.isError) void catalog.fetchNextPage();
  }, [catalog.fetchNextPage, catalog.hasNextPage, catalog.isError, catalog.isFetchingNextPage, unresolvedCount]);
  const catalogName = catalog.data?.pages.at(-1)?.activeCatalog?.name;
  const productCount = `${order.items.length} ${order.items.length === 1 ? 'product' : 'products'}`;
  const itemCount = `${order.totalQuantity} ${order.totalQuantity === 1 ? 'item' : 'items'}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={[styles.header, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.headerIcon}><ShoppingBag color="#059669" size={16} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.headerTitle, { color: colors.text }]}>Catalog order</Text><Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{catalogName ?? productCount} · {itemCount}</Text></View>
        <View style={styles.countBadge}><Text style={styles.countText}>{order.items.length}</Text></View>
      </View>
      <View style={styles.body}>
        {order.catalogId ? <View style={styles.catalogLine}><Package color={colors.textMuted} size={13} /><Text style={styles.catalogLabel}>CATALOG</Text><Text style={[styles.catalogId, { color: colors.text }]} numberOfLines={1}>{order.catalogId}</Text></View> : null}
        {order.text ? <Text style={[styles.orderText, { color: colors.textSecondary }]} numberOfLines={2}>{order.text}</Text> : null}
        <View style={[styles.items, { borderColor: colors.separator }]}>
          {order.items.map((item, index) => {
            const product: WhatsappCatalogProduct | undefined = products.find((candidate) => candidate.retailerId === item.productRetailerId) ?? products.find((candidate) => candidate.retailerId?.toLowerCase() === item.productRetailerId.toLowerCase());
            const name = product?.name ?? item.productRetailerId;
            const unitPrice = item.itemPrice ?? (product?.priceMinorUnits == null ? null : product.priceMinorUnits / 100);
            const currency = item.currency ?? product?.currency ?? order.currency;
            const lineTotal = item.lineTotal ?? (unitPrice === null ? null : unitPrice * item.quantity);
            const availability = formatAvailability(product?.availability ?? null);
            return (
              <View key={`${item.productRetailerId}-${index}`} style={[styles.itemRow, index > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
                {product?.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[styles.productImage, styles.imagePlaceholder, { backgroundColor: colors.surfaceSecondary }]}><Package color={colors.textMuted} size={16} /></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.productName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                  <Text style={styles.retailerId} numberOfLines={1}>{item.productRetailerId}</Text>
                  <View style={styles.itemMeta}><Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>Qty {item.quantity}</Text><Text style={styles.separator}>·</Text><Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>{formatPrice(unitPrice, currency)} each</Text>{availability ? <><Text style={styles.separator}>·</Text><Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>{availability}</Text></> : null}</View>
                  {product?.description ? <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>{product.description}</Text> : null}
                </View>
                <Text style={[styles.lineTotal, { color: colors.text }]}>{formatPrice(lineTotal, currency)}</Text>
              </View>
            );
          })}
        </View>
        {catalog.isFetchingNextPage ? <View style={styles.loading}><ActivityIndicator color={colors.primary} size="small" /><Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Loading product details…</Text></View> : null}
        <View style={[styles.totalRow, { borderTopColor: colors.cardBorder }]}><View style={styles.totalLabel}><ReceiptText color={colors.textSecondary} size={14} /><Text style={[styles.totalText, { color: colors.textSecondary }]}>Total · {itemCount}</Text></View><Text style={styles.totalPrice}>{formatPrice(order.totalPrice, order.currency)}</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 300, maxWidth: '100%', overflow: 'hidden', borderRadius: 17, borderWidth: 1 },
  header: { minHeight: 54, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  headerIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dcfce7' },
  headerTitle: { fontSize: 12, fontWeight: '700' },
  headerSubtitle: { marginTop: 2, fontSize: 10 },
  countBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ecfdf5' },
  countText: { color: '#047857', fontSize: 10, fontWeight: '700' },
  body: { padding: 11, gap: 10 },
  catalogLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catalogLabel: { color: '#64748b', fontSize: 9, letterSpacing: 0.8 },
  catalogId: { flex: 1, fontSize: 10, fontWeight: '600' },
  orderText: { fontSize: 11, lineHeight: 16 },
  items: { overflow: 'hidden', borderWidth: 1, borderRadius: 13 },
  itemRow: { paddingHorizontal: 9, paddingVertical: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  productImage: { width: 38, height: 38, borderRadius: 9 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 11, fontWeight: '700' },
  retailerId: { marginTop: 1, color: '#94a3b8', fontSize: 9 },
  itemMeta: { marginTop: 3, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  itemMetaText: { fontSize: 9 },
  separator: { color: '#94a3b8', fontSize: 9 },
  description: { marginTop: 3, fontSize: 9 },
  lineTotal: { fontSize: 10, fontWeight: '700' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalRow: { paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  totalText: { fontSize: 10, fontWeight: '500' },
  totalPrice: { color: '#047857', fontSize: 13, fontWeight: '800' },
});
