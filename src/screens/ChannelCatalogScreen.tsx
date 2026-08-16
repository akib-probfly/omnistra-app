import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, MessageCircle, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchChannels, startMessengerConnect, startWhatsAppConnect } from '../api/channels';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CardGridSkeleton } from '../components/Skeleton';
import { useTheme } from '../theme/ThemeContext';
import { AppChip, AppSearchField } from '../ui';

const CATALOG = [
  { id: 'whatsapp', name: 'WhatsApp Business Platform (API)', description: 'Connect WhatsApp Business API to enable seamless conversations.', category: 'Business Messaging', badge: 'Popular', tone: '#25D366', available: true },
  { id: 'messenger', name: 'Facebook Messenger', description: "Engage with your customers on the world's most used social platform.", category: 'Business Messaging', badge: 'Popular', tone: '#0084FF', available: true },
  { id: 'tiktok', name: 'TikTok', description: 'Connect TikTok Business Messaging to engage with a whole new audience.', category: 'Business Messaging', badge: 'Beta', tone: '#0f172a', available: false },
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

  const channels = useQuery({ queryKey: ['channels'], queryFn: () => fetchChannels(), staleTime: 2 * 60 * 1000 });
  const existingChannels = channels.data?.items ?? [];
  const workspaceId = existingChannels[0]?.workspaceId;
  const connectedTypes = new Set<string>(existingChannels.map((channel) => channel.type));
  const isChannelLimitReached = false;

  const connect = (id: string) => {
    if (!workspaceId) {
      setErrorText('No workspace is available to connect a channel. Please sign in and try again.');
      return;
    }
    const action = id === 'whatsapp' ? startWhatsAppConnect(workspaceId) : startMessengerConnect(workspaceId);
    launch.mutate({ id, action, workspaceId });
  };

  const launch = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: Promise<{ launchUrl?: string }>; workspaceId: string }) => {
      const result = await action;
      return { id, url: result.launchUrl };
    },
    onSuccess: ({ id, url }) => {
      setLaunchingId(null);
      if (url) {
        setSetupUrl(url);
      } else {
        Toast.show({ type: 'info', text1: 'Setup link unavailable', text2: 'Please connect this channel from the web workspace.' });
      }
    },
    onError: (error) => { setLaunchingId(null); setErrorText(error instanceof Error ? error.message : 'Connection failed.'); },
  });

  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return CATALOG.filter((item) => {
      const matchesFilter = activeFilter === 'All' || item.category === activeFilter;
      const normalized = query.trim().toLowerCase();
      const matchesQuery = normalized.length === 0 || item.name.toLowerCase().includes(normalized) || item.description.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, query]);

  const handleConnect = (item: (typeof CATALOG)[number]) => {
    if (!item.available || isChannelLimitReached || connectedTypes.has(item.id.toUpperCase())) return;
    setErrorText(null);
    setLaunchingId(item.id);
    connect(item.id);
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((filter) => (
          <AppChip
            key={filter}
            label={filter}
            selected={activeFilter === filter}
            onPress={() => setActiveFilter(filter)}
          />
        ))}
      </ScrollView>

      <View style={styles.searchRow}>
        <AppSearchField value={query} onChangeText={setQuery} placeholder="Search channel catalog..." />
      </View>

      {errorText ? <View style={[styles.banner, { backgroundColor: isDark ? colors.surface : '#fff1f2', borderColor: isDark ? colors.surfaceSecondary : '#fecdd3' }]}><Text style={[styles.bannerText, { color: colors.error }]}>{errorText}</Text></View> : null}
      {channels.isLoading ? <CardGridSkeleton cards={3} /> : null}

      <ScrollView contentContainerStyle={styles.grid}>
        {filteredItems.map((item) => {
          const isConnected = connectedTypes.has(item.id.toUpperCase());
          const isLaunching = launchingId === item.id;
          const disabled = !item.available || isLaunching || isConnected;
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
                    {isConnected ? 'Connected' : item.available ? 'Connect' : 'Coming soon'}
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
          if (!url) return;
          Linking.openURL(url).catch(() => Toast.show({ type: 'error', text1: 'Could not open browser', text2: url }));
        }}
      />
    </View>
  );
}

function ChannelGlyph({ id }: { id: string }) {
  if (id === 'whatsapp') return <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>w</Text>;
  if (id === 'messenger') return <MessageCircle color="#fff" size={20} />;
  if (id === 'instagram') return <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Ig</Text>;
  if (id === 'tiktok') return <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>TT</Text>;
  if (id === 'telegram') return <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Tg</Text>;
  if (id === 'email') return <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>@</Text>;
  if (id === 'voice') return <Users color="#fff" size={20} />;
  return <Text style={{ color: '#fff', fontSize: 18 }}>c</Text>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f3f8ff', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#dce8f7', borderBottomWidth: 1, flexDirection: 'row', paddingBottom: 12, paddingHorizontal: 16 },
  headerTitle: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  headerSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  filters: { gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  searchRow: { flexDirection: 'row', marginBottom: 12, marginHorizontal: 16 },
  banner: { backgroundColor: '#fff1f2', borderColor: '#fecdd3', borderRadius: 12, borderWidth: 1, marginHorizontal: 16, marginBottom: 10, padding: 12 },
  bannerText: { color: '#be123c', fontSize: 13 },
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