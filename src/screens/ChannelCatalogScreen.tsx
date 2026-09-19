import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { completeWhatsAppConnect, fetchChannels, startMessengerConnect, startTikTokConnect, startWhatsAppConnect, type WhatsAppConnectLaunch } from '../api/channels';
import { fetchMyWorkspaces } from '../api/workspaces';
import { ChannelLogo } from '../components/ChannelLogo';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CardGridSkeleton } from '../components/Skeleton';
import { useTheme } from '../theme/ThemeContext';
import { AppChip, AppSearchField } from '../ui';

const CATALOG = [
  { id: 'whatsapp', name: 'WhatsApp Business Platform (API)', description: 'Connect WhatsApp Business API to enable seamless conversations.', category: 'Business Messaging', badge: 'Popular', tone: '#25D366', available: true },
  { id: 'messenger', name: 'Facebook Messenger', description: "Engage with your customers on the world's most used social platform.", category: 'Business Messaging', badge: 'Popular', tone: '#0084FF', available: true },
  { id: 'tiktok', name: 'TikTok', description: 'Connect TikTok Business Messaging to engage with a whole new audience.', category: 'Business Messaging', badge: 'Beta', tone: '#0f172a', available: true },
  { id: 'instagram', name: 'Instagram', description: 'Reply to private messages and build a strong brand presence.', category: 'Business Messaging', tone: '#bc1888', available: false },
  { id: 'telegram', name: 'Telegram', description: 'Connect a Telegram Bot to provide real-time support to customers.', category: 'Business Messaging', tone: '#229ED9', available: false },
  { id: 'email', name: 'Email', description: 'Connect your shared inbox to handle email conversations.', category: 'Email', tone: '#334155', available: false },
  { id: 'voice', name: 'Voice Calls', description: 'Enable voice-first customer conversations and call routing.', category: 'Calls', tone: '#7c3aed', available: false },
];

const FILTERS = ['All', 'Business Messaging', 'Calls', 'SMS', 'Email', 'Live Chat'];

export function ChannelCatalogScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [activeFilter, setActiveFilter] = useState('All');
  const [query, setQuery] = useState('');
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const channels = useQuery({ queryKey: ['channels'], queryFn: () => fetchChannels(), staleTime: 2 * 60 * 1000 });
  const workspaces = useQuery({ queryKey: ['workspaces', 'mine'], queryFn: fetchMyWorkspaces, staleTime: 30_000 });
  const existingChannels = channels.data?.items ?? [];
  const workspaceId = existingChannels[0]?.workspaceId ?? workspaces.data?.items?.[0]?.id;
  const connectedTypes = new Set<string>(existingChannels.map((channel) => channel.type));
  const isChannelLimitReached = false;

  const connect = (id: string, catalogSetup: 'with_catalog' | 'without_catalog' = 'with_catalog') => {
    if (!workspaceId) {
      setErrorText('No workspace is available to connect a channel. Please sign in and try again.');
      return;
    }
    const action =
      id === 'whatsapp'
        ? startWhatsAppConnect(workspaceId, catalogSetup)
        : id === 'tiktok'
          ? startTikTokConnect(workspaceId)
          : startMessengerConnect(workspaceId);
    launch.mutate({ id, action, workspaceId });
  };

  const launch = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: Promise<WhatsAppConnectLaunch | { launchUrl?: string }>; workspaceId: string }) => {
      const result = await action;
      return { id, launch: result };
    },
    onSuccess: ({ id, launch: connectLaunch }) => {
      setLaunchingId(null);
      if (id === 'whatsapp' && 'state' in connectLaunch && 'redirectUri' in connectLaunch) {
        whatsappCallbackHandled.current = false;
        setWhatsappCompleting(false);
        setWhatsappPageLoading(true);
        setWhatsappWebUrl(connectLaunch.launchUrl);
        setWhatsappLaunch(connectLaunch);
      } else if (connectLaunch.launchUrl) {
        setSetupChannelId(id);
        setSetupUrl(connectLaunch.launchUrl);
      } else {
        Toast.show({ type: 'info', text1: 'Setup link unavailable', text2: 'Please connect this channel from the web workspace.' });
      }
    },
    onError: (error) => { setLaunchingId(null); setErrorText(error instanceof Error ? error.message : 'Connection failed.'); },
  });

  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [whatsappSetupDialogOpen, setWhatsappSetupDialogOpen] = useState(false);
  const [setupChannelId, setSetupChannelId] = useState<string | null>(null);
  const [whatsappLaunch, setWhatsappLaunch] = useState<WhatsAppConnectLaunch | null>(null);
  const [whatsappWebUrl, setWhatsappWebUrl] = useState<string | null>(null);
  const [whatsappCompleting, setWhatsappCompleting] = useState(false);
  const [whatsappPageLoading, setWhatsappPageLoading] = useState(true);
  const whatsappCallbackHandled = useRef(false);

  const handleWhatsAppCallback = async (url: string) => {
    const activeLaunch = whatsappLaunch;
    if (!activeLaunch || whatsappCallbackHandled.current) return;

    try {
      const callback = new URL(url);
      const expected = new URL(activeLaunch.redirectUri);
      if (callback.origin !== expected.origin || callback.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '')) return;

      whatsappCallbackHandled.current = true;
      setWhatsappCompleting(true);
      const params = new URLSearchParams(callback.search);
      const hashParams = new URLSearchParams(callback.hash.startsWith('#') ? callback.hash.slice(1) : callback.hash);
      hashParams.forEach((value, key) => { if (!params.has(key)) params.set(key, value); });
      const returnedError = params.get('error_description') || params.get('error_message') || params.get('error');
      if (returnedError) throw new Error(returnedError);
      const state = params.get('state');
      const code = params.get('code');
      if (!state || state !== activeLaunch.state) throw new Error('Meta returned an invalid WhatsApp setup state. Please try again.');
      if (!code) throw new Error('Meta did not return an authorization code. Please try again.');

      const result = await completeWhatsAppConnect({
        state,
        code,
        codeSource: 'redirect',
        wabaId: params.get('waba_id') ?? params.get('wabaId') ?? undefined,
        phoneNumberId: params.get('phone_number_id') ?? params.get('phoneNumberId') ?? undefined,
        displayPhoneNumber: params.get('display_phone_number') ?? params.get('displayPhoneNumber') ?? undefined,
        businessAccountId: params.get('business_id') ?? params.get('businessAccountId') ?? undefined,
      });
      setWhatsappLaunch(null);
      setWhatsappWebUrl(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['channels'] }),
        channels.refetch(),
      ]);
      Toast.show({
        type: result.channel.status === 'CONNECTED' ? 'success' : 'info',
        text1: result.channel.status === 'CONNECTED' ? 'WhatsApp connected' : 'WhatsApp setup is finishing',
        text2: result.channel.name || 'The channel status will update shortly.',
      });
    } catch (error) {
      setWhatsappLaunch(null);
      setWhatsappWebUrl(null);
      Toast.show({ type: 'error', text1: 'Could not finish WhatsApp setup', text2: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setWhatsappCompleting(false);
    }
  };

  const shouldLoadWhatsAppUrl = (url: string) => {
    if (!whatsappLaunch) return true;
    try {
      const callback = new URL(url);
      const expected = new URL(whatsappLaunch.redirectUri);
      if (callback.origin === expected.origin && callback.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, '')) {
        void handleWhatsAppCallback(url);
        return false;
      }
    } catch {
      // Let WebView handle non-URL navigation values.
    }
    return true;
  };

  const filteredItems = useMemo(() => {
    return CATALOG.filter((item) => {
      const matchesFilter = activeFilter === 'All' || item.category === activeFilter;
      const normalized = query.trim().toLowerCase();
      const matchesQuery = normalized.length === 0 || item.name.toLowerCase().includes(normalized) || item.description.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, query]);

  const handleConnect = (item: (typeof CATALOG)[number]) => {
    if (!item.available || isChannelLimitReached || (connectedTypes.has(item.id.toUpperCase()) && item.id !== 'whatsapp')) return;
    setErrorText(null);
    if (item.id === 'whatsapp') {
      setWhatsappSetupDialogOpen(true);
      return;
    }
    setLaunchingId(item.id);
    connect(item.id);
  };

  const launchWhatsAppSetup = (catalogSetup: 'with_catalog' | 'without_catalog') => {
    setWhatsappSetupDialogOpen(false);
    setLaunchingId('whatsapp');
    connect('whatsapp', catalogSetup);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}><ArrowLeft color={colors.textSecondary} size={23} /></Pressable>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Channel Catalog</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>Discover new channels to acquire more customers.</Text>
        </View>
      </View>

      <View style={styles.filtersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          style={styles.filtersScroll}
        >
          {FILTERS.map((filter) => (
            <AppChip
              key={filter}
              label={filter}
              selected={activeFilter === filter}
              onPress={() => setActiveFilter(filter)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.searchRow}>
        <AppSearchField value={query} onChangeText={setQuery} placeholder="Search channel catalog..." />
      </View>

      {errorText ? <View style={[styles.banner, { backgroundColor: isDark ? colors.surface : '#fff1f2', borderColor: isDark ? colors.surfaceSecondary : '#fecdd3' }]}><Text style={[styles.bannerText, { color: colors.error }]}>{errorText}</Text></View> : null}
      {whatsappLaunch ? <View style={[styles.pendingBanner, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><ActivityIndicator color={colors.primary} size="small" /><Text style={[styles.pendingText, { color: colors.textSecondary }]}>Complete Meta setup in the secure in-app window.</Text></View> : null}
      {channels.isLoading ? <CardGridSkeleton cards={3} /> : null}

      <ScrollView contentContainerStyle={styles.grid}>
        {filteredItems.map((item) => {
          const isConnected = connectedTypes.has(item.id.toUpperCase());
          const isLaunching = launchingId === item.id;
          const disabled = !item.available || isLaunching || (isConnected && item.id !== 'whatsapp');
          return (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <View style={styles.cardTop}>
                <View style={[styles.icon, { backgroundColor: item.tone }]}>
                  <ChannelGlyph id={item.id} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                    {item.badge ? <View style={styles.badge}><Text style={styles.badgeText}>{item.badge}</Text></View> : null}
                  </View>
                  <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
                </View>
              </View>
              <View style={[styles.cardFooter, { backgroundColor: colors.background, borderTopColor: colors.separator }]}>
                <Text style={[styles.category, { color: colors.textSecondary }]}>{item.category}</Text>
                <Pressable
                  style={[styles.connect, !item.available && styles.connectDisabled, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
                  disabled={disabled}
                  onPress={() => handleConnect(item)}
                >
                  {isLaunching ? <ActivityIndicator color={colors.text} size="small" /> : null}
                  <Text style={[styles.connectText, { color: colors.text }, isConnected && styles.connectConnected]}>
                    {isConnected ? item.id === 'whatsapp' ? 'Add another' : 'Connected' : item.available ? 'Connect' : 'Coming soon'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <ConfirmDialog
        visible={Boolean(setupUrl)}
        title="Open the setup page"
        body="A browser window will open where you can connect your account. Return here after you finish."
        confirmLabel="Open"
        onClose={() => setSetupUrl(null)}
        onConfirm={() => {
          const url = setupUrl;
          setSetupUrl(null);
          setSetupChannelId(null);
          if (!url) return;
          Linking.openURL(url).catch(() => Toast.show({ type: 'error', text1: 'Could not open browser', text2: url }));
        }}
      />
      <Modal visible={Boolean(whatsappLaunch)} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!whatsappCompleting) { setWhatsappLaunch(null); setWhatsappWebUrl(null); } }}>
        <View style={[styles.webviewScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.webviewHeader, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
            <View style={styles.webviewHeaderCopy}>
              <Text style={[styles.webviewTitle, { color: colors.text }]}>Connect WhatsApp</Text>
              <Text style={[styles.webviewSubtitle, { color: colors.textSecondary }]}>{whatsappCompleting ? 'Finishing secure setup…' : 'Sign in to Meta to continue'}</Text>
            </View>
            <Pressable disabled={whatsappCompleting} accessibilityRole="button" accessibilityLabel="Close WhatsApp setup" onPress={() => { setWhatsappLaunch(null); setWhatsappWebUrl(null); }} style={[styles.webviewClose, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.webviewCloseText, { color: colors.textSecondary }]}>{whatsappCompleting ? 'Please wait' : 'Close'}</Text>
            </Pressable>
          </View>
          {whatsappWebUrl ? <WebView
            source={{ uri: whatsappWebUrl }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            onLoadStart={() => setWhatsappPageLoading(true)}
            onLoadEnd={() => setWhatsappPageLoading(false)}
            onShouldStartLoadWithRequest={(request) => shouldLoadWhatsAppUrl(request.url)}
            onOpenWindow={(event) => {
              if (event.nativeEvent.targetUrl) {
                setWhatsappPageLoading(true);
                setWhatsappWebUrl(event.nativeEvent.targetUrl);
              }
            }}
            onError={(event) => {
              setWhatsappPageLoading(false);
              Toast.show({ type: 'error', text1: 'Meta page could not be loaded', text2: event.nativeEvent.description });
            }}
            style={styles.webview}
          /> : null}
          {whatsappPageLoading || whatsappCompleting ? <View style={[styles.webviewLoading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} size="large" /><Text style={[styles.pendingText, { color: colors.textSecondary, marginTop: 10 }]}>{whatsappCompleting ? 'Saving your WhatsApp connection…' : 'Loading Meta setup…'}</Text></View> : null}
        </View>
      </Modal>
      <Modal visible={whatsappSetupDialogOpen} transparent animationType="fade" onRequestClose={() => setWhatsappSetupDialogOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.setupModal, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={[styles.setupModalIcon, { backgroundColor: '#dcfce7' }]}><ChannelLogo type="WHATSAPP" box={42} glyph={22} radius={14} /></View>
            <Text style={[styles.setupTitle, { color: colors.text }]}>Choose your connection setup</Text>
            <Text style={[styles.setupDescription, { color: colors.textSecondary }]}>Choose whether this WhatsApp connection should include Meta product catalog access.</Text>
            <Pressable style={[styles.setupOption, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]} onPress={() => launchWhatsAppSetup('without_catalog')}>
              <Text style={[styles.setupOptionTitle, { color: colors.text }]}>Connect without catalog</Text>
              <Text style={[styles.setupOptionDescription, { color: colors.textSecondary }]}>Connect messaging only without requesting catalog access.</Text>
            </Pressable>
            <Pressable style={[styles.setupOption, styles.setupOptionPrimary]} onPress={() => launchWhatsAppSetup('with_catalog')}>
              <Text style={[styles.setupOptionTitle, { color: '#1d4ed8' }]}>Connect with catalog</Text>
              <Text style={[styles.setupOptionDescription, { color: '#475569' }]}>Enable product catalog and commerce features for this channel.</Text>
            </Pressable>
            <Pressable style={styles.cancelSetup} onPress={() => setWhatsappSetupDialogOpen(false)}><Text style={[styles.cancelSetupText, { color: colors.textSecondary }]}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChannelGlyph({ id }: { id: string }) {
  if (id === 'whatsapp') return <ChannelLogo type="WHATSAPP" box={48} glyph={24} radius={16} />;
  if (id === 'messenger') return <ChannelLogo type="MESSENGER" box={48} glyph={24} radius={16} />;
  if (id === 'instagram') return <ChannelLogo type="INSTAGRAM" box={48} glyph={24} radius={16} />;
  if (id === 'tiktok') return <ChannelLogo type="TIKTOK" box={48} glyph={24} radius={16} />;
  if (id === 'telegram') return <ChannelLogo type="TELEGRAM" box={48} glyph={24} radius={16} />;
  if (id === 'email') return <ChannelLogo type="EMAIL" box={48} glyph={24} radius={16} />;
  if (id === 'voice') return <Users color="#fff" size={20} />;
  return <Text style={{ color: '#fff', fontSize: 18 }}>c</Text>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f3f8ff', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#dce8f7', borderBottomWidth: 1, flexDirection: 'row', paddingBottom: 12, paddingHorizontal: 16 },
  headerTitle: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  headerSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  filtersContainer: { height: 54, justifyContent: 'center' },
  filtersScroll: { flexGrow: 0 },
  filters: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  searchRow: { flexDirection: 'row', marginBottom: 12, marginHorizontal: 16 },
  banner: { backgroundColor: '#fff1f2', borderColor: '#fecdd3', borderRadius: 12, borderWidth: 1, marginHorizontal: 16, marginBottom: 10, padding: 12 },
  bannerText: { color: '#be123c', fontSize: 13 },
  pendingBanner: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 9, marginBottom: 10, marginHorizontal: 16, padding: 12 },
  pendingText: { flex: 1, fontSize: 12, lineHeight: 17 },
  webviewScreen: { flex: 1 },
  webviewHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  webviewHeaderCopy: { flex: 1 },
  webviewTitle: { fontSize: 16, fontWeight: '800' },
  webviewSubtitle: { fontSize: 12, marginTop: 2 },
  webviewClose: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9 },
  webviewCloseText: { fontSize: 12, fontWeight: '700' },
  webview: { backgroundColor: '#fff', flex: 1 },
  webviewLoading: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 58 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.48)', flex: 1, justifyContent: 'center', padding: 22 },
  setupModal: { borderRadius: 24, borderWidth: 1, gap: 10, maxWidth: 440, padding: 20, width: '100%' },
  setupModalIcon: { alignItems: 'center', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  setupTitle: { fontSize: 19, fontWeight: '800' },
  setupDescription: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  setupOption: { borderRadius: 16, borderWidth: 1, padding: 14 },
  setupOptionPrimary: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  setupOptionTitle: { fontSize: 14, fontWeight: '700' },
  setupOptionDescription: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  cancelSetup: { alignItems: 'center', paddingVertical: 8 },
  cancelSetupText: { fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingBottom: 30 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 20, borderWidth: 1, overflow: 'hidden', width: '100%' },
  cardTop: { flexDirection: 'row', gap: 12, padding: 16 },
  icon: { alignItems: 'center', borderRadius: 16, height: 48, justifyContent: 'center', width: 48 },
  nameRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  name: { color: '#0f172a', flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  badge: { backgroundColor: '#e8fbf3', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#047857', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  description: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 6 },
  cardFooter: { alignItems: 'center', backgroundColor: '#fbfdff', borderTopColor: '#e8eef7', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  category: { color: '#64748b', fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  connect: { backgroundColor: '#fff9ef', borderColor: '#d8e6fb', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 4, minWidth: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  connectDisabled: { opacity: 0.6 },
  connectText: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  connectConnected: { color: '#047857' },
});
