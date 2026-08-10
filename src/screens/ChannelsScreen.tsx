import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, ChevronRight, CircleAlert, Pause, Search } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../api/client';
import { ChannelLogo } from '../components/ChannelLogo';
import { ErrorState } from '../components/ErrorState';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';
import { ListSkeleton } from '../components/Skeleton';
import type { ChannelsStackParamList } from '../navigation/ChannelsStack';

type Channel = {
  id: string;
  channelName?: string | null;
  name?: string | null;
  type?: string;
  channelType?: string;
  status?: string | null;
  webhookStatus?: string | null;
  phoneNumber?: string | null;
  phoneNumberId?: string | null;
  createdAt?: string;
  messagesLast24h?: number;
  lifecycle?: { isPaused?: boolean } | null;
  accounts?: Array<{
    displayPhoneNumber?: string | null;
    displayName?: string | null;
    pageName?: string | null;
    pageId?: string | null;
    wabaId?: string | null;
    phoneNumberId?: string | null;
  }>;
};
type ChannelsResponse = { items: Channel[]; summary?: { connectedCount?: number; activeTodayCount?: number; issuesCount?: number; messagesLast24h?: number } };

export function ChannelsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ChannelsStackParamList>>();
  const [search, setSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const query = `/channels?page=1&limit=100&sortBy=createdAt&sortOrder=desc${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`;
  const channels = useQuery({ queryKey: ['channels', search], queryFn: () => apiFetch<ChannelsResponse>(query), staleTime: 120000 });
  const items = channels.data?.items ?? [];
  const summary = channels.data?.summary;
  const openDetails = (channel: Channel) => navigation.navigate('ChannelDetails', { channelId: channel.id, channelName: channel.channelName ?? channel.name ?? 'Channel' });
  const metrics = [
    { label: 'Connected', value: summary?.connectedCount ?? items.filter((item) => item.status === 'CONNECTED').length, colors: ['#047857', '#34d399'] as [string, string] },
    { label: 'Active today', value: summary?.activeTodayCount ?? 0, colors: ['#1d4ed8', '#60a5fa'] as [string, string] },
    { label: 'Issues', value: summary?.issuesCount ?? items.filter((item) => item.status && item.status !== 'CONNECTED').length, colors: ['#c2410c', '#fb923c'] as [string, string] },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topbarCopy}>
          <Text style={styles.title}>Channels</Text>
          <Text style={styles.subtitle}>Manage your connected customer touchpoints.</Text>
        </View>
        <NotificationBell onOpen={() => setNotificationsOpen(true)} />
      </View>

      <View style={styles.metrics}>
        {metrics.map((metric) => (
          <LinearGradient
            key={metric.label}
            colors={metric.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.metricCard}
          >
            <View style={[styles.orb, styles.orbA]} />
            <View style={[styles.orb, styles.orbB]} />
            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{metric.value}</Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
          </LinearGradient>
        ))}
      </View>

      <View style={styles.search}>
        <Search color="#8ba2c3" size={18} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search channels..." placeholderTextColor="#8ba2c3" style={styles.searchInput} />
      </View>

      {channels.isError ? (
        <ErrorState message={channels.error instanceof Error ? channels.error.message : undefined} onRetry={() => channels.refetch()} />
      ) : channels.isLoading ? (
        <ListSkeleton rows={5} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={channels.isRefetching} onRefresh={() => channels.refetch()} tintColor="#2563eb" />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ChannelLogo box={52} glyph={26} radius={18} />
              <Text style={styles.emptyTitle}>No channels connected</Text>
              <Text style={styles.emptyText}>Channels connected in the web workspace will appear here automatically.</Text>
            </View>
          }
          renderItem={({ item }) => <ChannelRow channel={item} onPress={() => openDetails(item)} />}
        />
      )}

      <NotificationCenter visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </View>
  );
}

function ChannelRow({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const status = (channel.status ?? channel.webhookStatus ?? 'UNKNOWN').toUpperCase();
  const isPaused = channel.lifecycle?.isPaused ?? false;
  const connected = status === 'CONNECTED' && !isPaused;
  const primary = channel.accounts?.[0];
  const primaryLine = primary?.displayPhoneNumber ?? primary?.displayName ?? primary?.pageName ?? channel.phoneNumber ?? channel.phoneNumberId ?? channel.type ?? channel.channelType ?? 'Channel connection';
  const idLine = primary?.wabaId ?? primary?.phoneNumberId ?? primary?.pageId ?? channel.id.slice(-15);
  const statusLabel = isPaused ? 'Paused' : connected ? 'Active' : status.toLowerCase();
  const StatusIcon = isPaused ? Pause : connected ? CheckCircle2 : CircleAlert;
  const statusTone = isPaused || !connected ? '#d97706' : '#059669';
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <ChannelLogo type={channel.type ?? channel.channelType} box={48} glyph={24} radius={14} />
      <View style={styles.copy}>
        <View style={styles.nameLine}>
          <Text style={styles.name}>{channel.channelName ?? channel.name ?? 'Unnamed channel'}</Text>
          <View style={[styles.badge, { backgroundColor: isPaused || !connected ? '#fff4d6' : '#dff8ee' }]}>
            <StatusIcon color={statusTone} size={12} />
            <Text style={{ color: statusTone, fontSize: 11, fontWeight: '600' }}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.detail} numberOfLines={1}>{primaryLine}</Text>
        <View style={styles.metaLine}>
          <Text style={styles.idText} numberOfLines={1}>ID: {idLine}</Text>
          <Text style={styles.msg24h}>{channel.messagesLast24h ?? 0} msgs / 24h</Text>
        </View>
      </View>
      <ChevronRight color="#94a3b8" size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#eef4fb', flex: 1 },
  topbar: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 18 },
  topbarCopy: { flex: 1, minWidth: 0 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 4 },
  metrics: { flexDirection: 'row', gap: 10, marginTop: 16, paddingHorizontal: 16 },
  metricCard: {
    borderRadius: 14,
    flex: 1,
    gap: 4,
    minWidth: 0,
    overflow: 'hidden',
    padding: 12,
  },
  metricValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  metricLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '600', marginTop: 3 },
  orb: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, position: 'absolute' },
  orbA: { height: 72, right: -20, top: -24, width: 72 },
  orbB: { bottom: -22, height: 56, left: -16, width: 56 },
  search: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 22, borderWidth: 1, flexDirection: 'row', margin: 16, marginBottom: 0, paddingHorizontal: 12 },
  searchInput: { color: '#17233a', flex: 1, height: 44, marginLeft: 8 },
  list: { gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  card: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, flexDirection: 'row', padding: 14 },
  copy: { flex: 1, marginLeft: 12 },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  name: { color: '#0f172a', flexShrink: 1, fontSize: 15, fontWeight: '700' },
  badge: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 3, paddingHorizontal: 8, paddingVertical: 3 },
  detail: { color: '#475569', fontSize: 13, marginTop: 3 },
  metaLine: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 5 },
  idText: { color: '#94a3b8', flex: 1, fontSize: 11 },
  msg24h: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700', marginTop: 14 },
  emptyText: { color: '#64748b', fontSize: 13, marginTop: 5, maxWidth: 240, textAlign: 'center' },
});
