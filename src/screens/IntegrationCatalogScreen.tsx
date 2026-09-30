import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Plug, Truck, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { createCourierConnection, listCourierConnections } from '../api/couriers';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard, AppSearchField, AppTextField, ScreenHeader } from '../ui';

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
    setError('');
  };

  const connect = async () => {
    if (!selected?.provider) return;
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
        ...(isPathao ? {
          username: credentials.username.trim(),
          password: credentials.password,
          providerConfig: { environment: 'PRODUCTION' },
        } : {}),
      });
      if (result.status !== 'CONNECTED') {
        setError(result.lastErrorMessage || 'We could not verify these credentials. Please review them and try again.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['courier-connections'] });
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect this courier. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const patchCredentials = (key: keyof CredentialValues, value: string) => setCredentials((current) => ({ ...current, [key]: value }));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Integration Catalog" subtitle="Connect a store or a delivery partner to your workspace." onBack={() => navigation.goBack()} />
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
                <IntegrationLogo item={item} />
                <View style={styles.copy}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>{item.description}</Text>
                  {connected ? <View style={styles.connected}><Check size={14} color={colors.success} /><Text style={[styles.connectedText, { color: colors.success }]}>Connected</Text></View> : null}
                </View>
              </View>
              <View style={[styles.cardFooter, { borderTopColor: colors.cardBorder, backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>{item.category.toUpperCase()}</Text>
                <Pressable disabled={item.soon || connected || !item.provider} onPress={() => openConnect(item)} style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, (item.soon || connected) && styles.disabled]}>
                  <Text style={[styles.actionText, { color: item.soon ? colors.textMuted : colors.text }]}>{item.soon ? 'Coming soon' : connected ? 'Connected' : 'Connect'}</Text>
                  {!item.soon && !connected ? <ChevronRight size={16} color={colors.text} /> : null}
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
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            <AppButton label="Connect courier" icon={Plug} onPress={() => void connect()} loading={saving} loadingLabel="Connecting..." disabled={!credentials.displayName.trim() || !credentials.apiKey.trim() || !credentials.apiSecret.trim() || (selected?.provider === 'PATHAO' && (!credentials.username.trim() || !credentials.password))} block />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function IntegrationLogo({ item }: { item: Integration }) {
  const { colors } = useTheme();
  if (item.id === 'pathao') {
    return <View style={[styles.logo, { backgroundColor: '#ef3340' }]}><Image source={require('../../assets/integration-pathao-mark.png')} style={styles.pathaoMark} contentFit="contain" /></View>;
  }
  if (item.id === 'steadfast') {
    return <View style={[styles.logo, { backgroundColor: '#edffd9' }]}><Image source={require('../../assets/integration-steadfast.jpg')} style={styles.logoImage} contentFit="contain" /></View>;
  }
  if (item.id === 'shopify') {
    return <View style={[styles.logo, { backgroundColor: '#95bf47' }]}><Svg width={30} height={30} viewBox="0 0 24 24"><Path fill="#fff" d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z" /></Svg></View>;
  }
  if (item.id === 'woocommerce') {
    return <View style={[styles.logo, { backgroundColor: '#7f3fff' }]}><Image source={require('../../assets/integration-woocommerce.png')} style={styles.logoImage} contentFit="contain" /></View>;
  }
  return <View style={[styles.logo, { backgroundColor: colors.primarySoft }]}><Plug color={colors.primary} size={25} /></View>;
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
  logo: { alignItems: 'center', borderRadius: radius.pill, height: 52, justifyContent: 'center', overflow: 'hidden', width: 52 },
  logoImage: { height: 46, width: 46 },
  pathaoMark: { height: 72, width: 72 },
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
  error: { fontSize: fontSize.caption },
});
