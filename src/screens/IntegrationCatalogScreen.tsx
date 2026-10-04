import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Plug, Truck, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { createCourierConnection, DEFAULT_COURIER_DELIVERY_FEES, listCourierConnections } from '../api/couriers';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { IntegrationLogo } from '../components/IntegrationLogo';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard, AppSearchField, AppText, AppTextField, ScreenHeader } from '../ui';

type Category = 'All' | 'Store' | 'Delivery Partner';
type Integration = {
  id: string;
  name: string;
  description: string;
  category: Exclude<Category, 'All'>;
  provider?: string;
  soon?: boolean;
};

const FILTERS: Category[] = ['All', 'Store', 'Delivery Partner'];
const INTEGRATIONS: Integration[] = [
  { id: 'shopify', name: 'Shopify', description: 'Order and delivery alerts over WhatsApp.', category: 'Store', soon: true },
  { id: 'woocommerce', name: 'WooCommerce', description: 'Order and shipping notifications from your WooCommerce store.', category: 'Store', soon: true },
  { id: 'pathao', name: 'Pathao Courier', description: 'Book parcels and track delivery across Bangladesh.', category: 'Delivery Partner', provider: 'PATHAO' },
  { id: 'steadfast', name: 'Steadfast Courier', description: 'Book parcels, print labels and track delivery.', category: 'Delivery Partner', provider: 'STEADFAST' },
];

type CredentialValues = { displayName: string; providerAccountId: string; apiKey: string; apiSecret: string; username: string; password: string };
const EMPTY_CREDENTIALS: CredentialValues = { displayName: '', providerAccountId: '', apiKey: '', apiSecret: '', username: '', password: '' };

export function IntegrationCatalogScreen() {
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [category, setCategory] = useState<Category>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Integration | null>(null);
  const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [insideDhakaFee, setInsideDhakaFee] = useState(String(DEFAULT_COURIER_DELIVERY_FEES.insideDhaka));
  const [outsideDhakaFee, setOutsideDhakaFee] = useState(String(DEFAULT_COURIER_DELIVERY_FEES.outsideDhaka));
  const connectionsQuery = useQuery({
    queryKey: ['courier-connections'],
    queryFn: listCourierConnections,
  });
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return INTEGRATIONS.filter((item) =>
      (category === 'All' || category === item.category)
      && (!query || `${item.name} ${item.description}`.toLowerCase().includes(query)),
    );
  }, [category, search]);
  const connectedProviders = new Set((connectionsQuery.data?.items ?? []).filter((item) => item.status === 'CONNECTED').map((item) => item.provider));

  const openConnect = (item: Integration) => {
    setSelected(item);
    setCredentials({ ...EMPTY_CREDENTIALS, displayName: `Primary ${item.id === 'pathao' ? 'Pathao' : 'Steadfast'} account` });
    setInsideDhakaFee(String(DEFAULT_COURIER_DELIVERY_FEES.insideDhaka));
    setOutsideDhakaFee(String(DEFAULT_COURIER_DELIVERY_FEES.outsideDhaka));
    setError('');
  };

  const connect = async () => {
    if (!selected?.provider) return;
    const parsedInsideDhakaFee = Number.parseFloat(insideDhakaFee);
    const parsedOutsideDhakaFee = Number.parseFloat(outsideDhakaFee);
    if (
      !Number.isFinite(parsedInsideDhakaFee) || parsedInsideDhakaFee < 0 ||
      !Number.isFinite(parsedOutsideDhakaFee) || parsedOutsideDhakaFee < 0
    ) {
      setError('Enter valid non-negative delivery fees.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const isPathao = selected.provider === 'PATHAO';
      const result = await createCourierConnection({
        provider: selected.provider,
        displayName: credentials.displayName.trim(),
        ...(credentials.providerAccountId.trim() ? { providerAccountId: credentials.providerAccountId.trim() } : {}),
        apiKey: credentials.apiKey.trim(),
        apiSecret: credentials.apiSecret.trim(),
        ...(isPathao ? { username: credentials.username.trim(), password: credentials.password } : {}),
        providerConfig: {
          ...(isPathao ? { environment: 'PRODUCTION' } : {}),
          deliveryFees: {
            insideDhaka: parsedInsideDhakaFee,
            outsideDhaka: parsedOutsideDhakaFee,
          },
        },
      });
      if (result.status !== 'CONNECTED') {
        setError(result.lastErrorMessage || 'We could not verify these credentials. Please review them and try again.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['courier-connections'] });
      setSelected(null);
      navigation.goBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect this courier. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const patchCredentials = (key: keyof CredentialValues, value: string) => setCredentials((current) => ({ ...current, [key]: value }));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Integration Catalog"  onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.filters}>
          {FILTERS.map((item) => {
            const active = category === item;
            return (
              <Pressable key={item} onPress={() => setCategory(item)} style={[styles.filter, { backgroundColor: active ? colors.text : colors.surface, borderColor: active ? colors.text : colors.cardBorder }]}>
                <Text style={[styles.filterText, { color: active ? colors.surface : colors.textSecondary }]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
        <AppSearchField value={search} onChangeText={setSearch} placeholder="Search integration catalog..." fill={false} />
        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        {visibleItems.length === 0 ? (
          <AppCard><Text style={[styles.empty, { color: colors.textSecondary }]}>No integrations match your search.</Text></AppCard>
        ) : visibleItems.map((item) => {
          const connected = item.provider ? connectedProviders.has(item.provider) : false;
          return (
            <AppCard key={item.id} padding="xs" style={styles.card}>
              <View style={styles.cardMain}>
                <IntegrationLogo integrationId={item.id} />
                <View style={styles.copy}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>{item.description}</Text>
                  {connected ? <View style={styles.connected}><Check size={14} color={colors.success} /><Text style={[styles.connectedText, { color: colors.success }]}>Connected</Text></View> : null}
                </View>
              </View>
              <View style={[styles.cardFooter, { borderTopColor: colors.cardBorder, backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>{item.category.toUpperCase()}</Text>
                <Pressable disabled={item.soon || !item.provider} onPress={() => openConnect(item)} style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, (item.soon || !item.provider) && styles.disabled]}>
                  <Text style={[styles.actionText, { color: item.soon ? colors.textMuted : colors.text }]}>{item.soon ? 'Coming soon' : 'Connect'}</Text>
                  {!item.soon && item.provider ? <ChevronRight size={16} color={colors.text} /> : null}
                </Pressable>
              </View>
            </AppCard>
          );
        })}
      </ScrollView>

      <Modal visible={Boolean(selected)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.cardBorder }]}>
            <View style={[styles.modalIcon, { backgroundColor: colors.primarySoft }]}><Truck color={colors.primary} size={20} /></View>
            <View style={styles.copy}><Text style={[styles.modalTitle, { color: colors.text }]}>Connect {selected?.name}</Text><Text style={[styles.description, { color: colors.textSecondary }]}>Add the credentials from your courier account.</Text></View>
            <Pressable onPress={() => setSelected(null)} accessibilityLabel="Close"><X color={colors.textSecondary} size={22} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <AppTextField label="Connection name" value={credentials.displayName} onChangeText={(value) => patchCredentials('displayName', value)} placeholder="Primary courier account" autoCapitalize="words" />
            {selected?.provider === 'PATHAO' ? <AppTextField label="Provider account ID (optional)" value={credentials.providerAccountId} onChangeText={(value) => patchCredentials('providerAccountId', value)} placeholder="Merchant account ID" /> : null}
            <AppTextField label={selected?.provider === 'PATHAO' ? 'Client ID' : 'API key'} value={credentials.apiKey} onChangeText={(value) => patchCredentials('apiKey', value)} placeholder={selected?.provider === 'PATHAO' ? 'Paste your Client ID' : 'Paste your API key'} autoCapitalize="none" />
            <AppTextField label={selected?.provider === 'PATHAO' ? 'Client secret' : 'Secret key'} value={credentials.apiSecret} onChangeText={(value) => patchCredentials('apiSecret', value)} placeholder={selected?.provider === 'PATHAO' ? 'Paste your Client secret' : 'Paste your secret key'} secureTextEntry autoCapitalize="none" />
            {selected?.provider === 'PATHAO' ? <>
              <AppTextField label="Merchant email" value={credentials.username} onChangeText={(value) => patchCredentials('username', value)} placeholder="Merchant login email" keyboardType="email-address" autoCapitalize="none" />
              <AppTextField label="Merchant password" value={credentials.password} onChangeText={(value) => patchCredentials('password', value)} placeholder="Merchant login password" secureTextEntry autoCapitalize="none" />
            </> : null}
            <AppText variant="bodyStrong">Delivery fees (BDT)</AppText>
            <AppText variant="small" tone="secondary">These fees are added to new orders based on the recipient city.</AppText>
            <View style={styles.deliveryFeesRow}>
              <AppTextField style={styles.deliveryFeeField} label="Inside Dhaka" value={insideDhakaFee} onChangeText={setInsideDhakaFee} placeholder="50" keyboardType="decimal-pad" />
              <AppTextField style={styles.deliveryFeeField} label="Outside Dhaka" value={outsideDhakaFee} onChangeText={setOutsideDhakaFee} placeholder="100" keyboardType="decimal-pad" />
            </View>
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            <AppButton label="Connect courier" icon={Plug} onPress={() => void connect()} loading={saving} loadingLabel="Connecting..." disabled={!credentials.displayName.trim() || !credentials.apiKey.trim() || !credentials.apiSecret.trim() || (selected?.provider === 'PATHAO' && (!credentials.username.trim() || !credentials.password))} block />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxxl },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filter: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterText: { fontSize: fontSize.small, fontWeight: fontWeight.medium },
  divider: { height: 1, marginVertical: spacing.xs },
  card: { borderRadius: radius.xxl, overflow: 'hidden', padding: 0 },
  cardMain: { flexDirection: 'row', gap: spacing.md, minHeight: 132, padding: spacing.lg },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  description: { fontSize: fontSize.caption, lineHeight: 21, marginTop: spacing.sm },
  connected: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  connectedText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  cardFooter: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
  categoryLabel: { fontSize: fontSize.tiny, fontWeight: fontWeight.medium, letterSpacing: 1 },
  action: { alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, height: 36, justifyContent: 'center', minWidth: 112, paddingHorizontal: spacing.md },
  actionText: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  disabled: { opacity: 0.6 },
  empty: { fontSize: fontSize.body, padding: spacing.lg, textAlign: 'center' },
  modal: { flex: 1 },
  modalHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  modalIcon: { alignItems: 'center', borderRadius: radius.lg, height: 42, justifyContent: 'center', width: 42 },
  modalTitle: { fontSize: fontSize.heading, fontWeight: fontWeight.bold },
  form: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxxl },
  deliveryFeesRow: { flexDirection: 'row', gap: spacing.sm },
  deliveryFeeField: { flex: 1 },
  error: { fontSize: fontSize.caption },
});
