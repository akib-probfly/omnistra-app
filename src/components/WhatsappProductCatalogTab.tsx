import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { AlertCircle, ArrowUpRight, CheckCircle2, CircleDollarSign, Hash, Link2, Package, PackageCheck, RefreshCw, Tag } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { connectWhatsappProductCatalog, fetchWhatsappProductCatalog, type WhatsappCatalogProduct } from '../api/channels';
import { AppButton } from '../ui';
import { useTheme } from '../theme/ThemeContext';

const PAGE_SIZE = 25;

function formatPrice(price: number | null, currency: string | null) {
  if (price === null) return 'Price unavailable';
  const amount = (price / 100).toFixed(2);
  const code = currency?.toUpperCase();
  if (code === 'BDT') return `৳${amount}`;
  if (code === 'USD') return `$${amount}`;
  return code ? `${amount} ${code}` : amount;
}

function formatAvailability(value: string | null) {
  return value ? value.split(/[_-]+/).map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase()).join(' ') : 'Not provided';
}

function ProductCard({ product }: { product: WhatsappCatalogProduct }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.productCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={styles.productImage} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[styles.productImage, styles.imagePlaceholder, { backgroundColor: colors.surfaceSecondary }]}><Package color={colors.textMuted} size={20} /></View>
      )}
      <View style={styles.productContent}>
        <View style={styles.productTitleRow}>
          <Text style={[styles.productTitle, { color: colors.text }]} numberOfLines={2}>{product.name || product.retailerId || 'Untitled product'}</Text>
          <View style={styles.price}><Tag color="#059669" size={12} /><Text style={styles.priceText}>{formatPrice(product.priceMinorUnits, product.currency)}</Text></View>
        </View>
        <View style={[styles.metadata, { borderTopColor: colors.separator }]}>
          <MetaItem icon={Tag} label="SKU" value={product.retailerId || 'Not provided'} />
          <MetaItem icon={Hash} label="Meta ID" value={product.id} />
          <MetaItem icon={CircleDollarSign} label="Currency" value={product.currency || 'Not provided'} />
          <MetaItem icon={PackageCheck} label="Availability" value={formatAvailability(product.availability)} />
          <MetaItem icon={Package} label="Status" value={product.status} />
        </View>
      </View>
    </View>
  );
}

function MetaItem({ icon: Icon, label, value }: { icon: typeof Tag; label: string; value: string }) {
  const { colors } = useTheme();
  return <View style={styles.metaItem}><Text style={styles.metaLabel}><Icon color="#94a3b8" size={11} /> {label.toUpperCase()}</Text><Text style={[styles.metaValue, { color: colors.textSecondary }]} numberOfLines={1}>{value}</Text></View>;
}

export function WhatsappProductCatalogTab({ channelId }: { channelId: string }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [catalogIdDraft, setCatalogIdDraft] = useState('');
  const queryKey = ['channels', 'product-catalog', channelId, null] as const;
  const catalog = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchWhatsappProductCatalog(channelId, undefined, pageParam, PAGE_SIZE),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 60000,
  });
  const latest = catalog.data?.pages.at(-1);
  const activeCatalog = latest?.activeCatalog ?? latest?.catalogs[0] ?? null;
  const products = catalog.data?.pages.flatMap((page) => page.products) ?? [];
  const connect = useMutation({
    mutationFn: (id: string) => connectWhatsappProductCatalog(channelId, id),
    onSuccess: async (result) => {
      setCatalogIdDraft('');
      await queryClient.invalidateQueries({ queryKey });
      Toast.show({ type: 'success', text1: 'Product catalog connected' });
      if (result.response) queryClient.setQueryData(queryKey, { pages: [result.response], pageParams: [undefined] });
    },
    onError: (error) => Toast.show({ type: 'error', text1: 'Could not connect catalog', text2: error instanceof Error ? error.message : 'Please try again.' }),
  });
  const catalogId = catalogIdDraft.trim() || activeCatalog?.id || '';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={[styles.hero, { backgroundColor: colors.surfaceSecondary }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}><Package color={colors.primary} size={21} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>WHATSAPP COMMERCE</Text>
            <Text style={[styles.title, { color: colors.text }]}>Product catalog</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>Browse products connected to this WhatsApp Business account.</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: latest?.status === 'CONNECTED' ? '#dcfce7' : colors.surface }]}><View style={[styles.statusDot, { backgroundColor: latest?.status === 'CONNECTED' ? '#16a34a' : '#94a3b8' }]} /><Text style={[styles.statusText, { color: latest?.status === 'CONNECTED' ? '#15803d' : colors.textSecondary }]}>{latest?.status === 'CONNECTED' ? 'Active' : 'Setup'}</Text></View>
        </View>
        <View style={[styles.accessCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
          <View style={styles.accessIcon}><Link2 color={colors.primary} size={17} /></View>
          <View style={styles.accessCopy}><Text style={[styles.accessTitle, { color: colors.text }]}>Secure Meta connection</Text><Text style={[styles.subtitle, { marginTop: 4, marginBottom: 0, fontSize: 12 }]}>Catalog access uses this channel’s saved credentials.</Text></View>
          <View style={styles.connectedPill}><CheckCircle2 color={colors.primary} size={13} /><Text style={[styles.connectedText, { color: colors.primary }]}>{latest?.status === 'CONNECTED' ? 'Connected' : 'Not connected'}</Text></View>
        </View>
        <View style={[styles.form, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
          <Text style={[styles.formLabel, { color: colors.text }]}>Meta catalog ID</Text>
          <View style={styles.formRow}>
            <TextInput value={catalogIdDraft} onChangeText={setCatalogIdDraft} placeholder="Paste catalog ID from Commerce Manager" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]} autoCapitalize="none" />
            <AppButton label={activeCatalog?.id === catalogId ? 'Connected' : 'Connect catalog'} icon={Link2} loading={connect.isPending} disabled={!catalogId || activeCatalog?.id === catalogId} onPress={() => connect.mutate(catalogId)} />
          </View>
        </View>
        {catalog.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={[styles.subtitle, { marginTop: 8 }]}>Fetching catalogs from Meta…</Text></View> : catalog.isError ? (
          <View style={[styles.errorCard, { borderColor: colors.error }]}><AlertCircle color={colors.error} size={18} /><View style={{ flex: 1 }}><Text style={[styles.accessTitle, { color: colors.error }]}>Catalog fetch failed</Text><Text style={[styles.subtitle, { marginTop: 4 }]}>{catalog.error instanceof Error ? catalog.error.message : 'Check catalog access and try again.'}</Text><AppButton label="Retry" icon={RefreshCw} variant="secondary" onPress={() => void catalog.refetch()} style={{ alignSelf: 'flex-start', marginTop: 10 }} /></View></View>
        ) : (
          <>
            <View style={[styles.catalogSummary, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <View style={styles.catalogIdentity}><View style={[styles.catalogIcon, { backgroundColor: colors.surfaceSecondary }]}><PackageCheck color={colors.primary} size={18} /></View><View style={{ flex: 1 }}><Text style={styles.overline}>CONNECTED META CATALOG</Text><Text style={[styles.catalogName, { color: colors.text }]}>{activeCatalog?.name || 'Untitled catalog'}</Text><Text style={[styles.subtitle, { marginTop: 3, marginBottom: 0 }]}>ID {activeCatalog?.id || 'unavailable'}</Text></View></View>
              <View style={styles.summaryActions}><View style={styles.oneCatalog}><Text style={[styles.connectedText, { color: colors.primary }]}>One catalog per WABA</Text></View><AppButton label="Refresh" icon={RefreshCw} variant="secondary" loading={catalog.isFetching} onPress={() => void catalog.refetch()} /></View>
            </View>
            <View style={[styles.resultsHeader, { borderBottomColor: colors.separator }]}><View style={styles.resultsHeaderInfo}><Text style={[styles.resultsTitle, { color: colors.text }]}>Products</Text><Text style={[styles.subtitle, { marginTop: 2, marginBottom: 0 }]}>{products.length} loaded{catalog.hasNextPage ? ' · more available' : ''}</Text></View><Text style={[styles.subtitle, styles.resultsUpdated, { marginBottom: 0, color: colors.textSecondary }]}>{latest?.lastFetchedAt ? `Updated ${new Date(latest.lastFetchedAt).toLocaleString()}` : 'Not fetched yet'}</Text></View>
            {products.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><Text style={[styles.subtitle, { marginBottom: 0 }]}>No products were returned for this catalog.</Text></View> : products.map((product) => <ProductCard key={product.id} product={product} />)}
            {catalog.hasNextPage ? <AppButton label={catalog.isFetchingNextPage ? 'Loading products…' : 'Load more products'} icon={ArrowUpRight} variant="secondary" loading={catalog.isFetchingNextPage} onPress={() => void catalog.fetchNextPage()} style={{ alignSelf: 'center' }} /> : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 14, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 26, padding: 14, gap: 14, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.04, shadowRadius: 14, elevation: 2 },
  hero: { borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  heroIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 3 },
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.35 },
  heroSubtitle: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  subtitle: { color: '#64748b', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  accessCard: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  accessIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  accessCopy: { flex: 1 },
  accessTitle: { fontSize: 13, fontWeight: '700' },
  connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  connectedText: { fontSize: 11, fontWeight: '700' },
  form: { borderWidth: 1, borderRadius: 18, padding: 13, gap: 8 },
  formLabel: { fontSize: 12, fontWeight: '600' },
  formRow: { gap: 8 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13 },
  catalogSummary: { borderWidth: 1, borderRadius: 19, padding: 13, gap: 12 },
  catalogIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catalogIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  overline: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  catalogName: { marginTop: 6, fontSize: 14, fontWeight: '600' },
  summaryActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  oneCatalog: { backgroundColor: '#eef2ff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  resultsHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10, gap: 8 },
  resultsHeaderInfo: { flex: 1, minWidth: 0 },
  resultsUpdated: { flexShrink: 1, maxWidth: '52%', lineHeight: 16, textAlign: 'right' },
  resultsTitle: { fontSize: 16, fontWeight: '800' },
  productCard: { borderWidth: 1, borderRadius: 19, padding: 10, flexDirection: 'row', gap: 11, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 8, elevation: 1 },
  productImage: { width: 72, height: 72, borderRadius: 15 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productContent: { flex: 1, minWidth: 0 },
  productTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  productTitle: { flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  price: { color: '#047857', backgroundColor: '#ecfdf5', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceText: { color: '#047857', fontSize: 11, fontWeight: '700' },
  description: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  metadata: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaItem: { width: '46%' },
  metaLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '700' },
  metaValue: { marginTop: 2, fontSize: 10 },
  center: { alignItems: 'center', paddingVertical: 20 },
  errorCard: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  empty: { borderWidth: 1, borderRadius: 18, padding: 22, alignItems: 'center' },
});
