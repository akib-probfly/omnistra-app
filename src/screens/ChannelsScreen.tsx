import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, ChevronRight, CircleAlert, Pause } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../api/client';
import { ChannelLogo } from '../components/ChannelLogo';
import { ErrorState } from '../components/ErrorState';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';
import { ListSkeleton } from '../components/Skeleton';
import type { ChannelsStackParamList } from '../navigation/ChannelsStack';
import { useTheme } from '../theme/ThemeContext';
import { fontWeight, radius, spacing } from '../theme/tokens';
import { AppBadge, AppSearchField, AppText, EmptyState } from '../ui';

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
  const { colors } = useTheme();
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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topbar, { paddingTop: insets.top + spacing.sm + 2, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.topbarCopy}>
          <AppText variant="title">Channels</AppText>
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

      <View style={styles.searchRow}>
        <AppSearchField value={search} onChangeText={setSearch} placeholder="Search channels..." />
      </View>

      {channels.isError ? (
        <ErrorState message={channels.error instanceof Error ? channels.error.message : undefined} onRetry={() => channels.refetch()} />
      ) : channels.isLoading ? (
        <ListSkeleton rows={5} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={channels.isRefetching} onRefresh={() => channels.refetch()} tintColor={colors.primary} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              illustration={<ChannelLogo box={52} glyph={26} radius={18} />}
              title="No channels connected"
              message="Channels connected in the web workspace will appear here automatically."
            />
          }
          renderItem={({ item }) => <ChannelRow channel={item} onPress={() => openDetails(item)} />}
        />
      )}

      <NotificationCenter visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </View>
  );
}

function ChannelRow({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const { colors } = useTheme();
  const status = (channel.status ?? channel.webhookStatus ?? 'UNKNOWN').toUpperCase();
  const isPaused = channel.lifecycle?.isPaused ?? false;
  const connected = status === 'CONNECTED' && !isPaused;
  const primary = channel.accounts?.[0];
  const primaryLine = primary?.displayPhoneNumber ?? primary?.displayName ?? primary?.pageName ?? channel.phoneNumber ?? channel.phoneNumberId ?? channel.type ?? channel.channelType ?? 'Channel connection';
  const idLine = primary?.wabaId ?? primary?.phoneNumberId ?? primary?.pageId ?? channel.id.slice(-15);
  const statusLabel = isPaused ? 'Paused' : connected ? 'Active' : status.toLowerCase();
  const StatusIcon = isPaused ? Pause : connected ? CheckCircle2 : CircleAlert;
  const statusTone = isPaused || !connected ? 'warning' : 'success';
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <ChannelLogo type={channel.type ?? channel.channelType} box={48} glyph={24} radius={14} />
      <View style={styles.copy}>
        <View style={styles.nameLine}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>{channel.channelName ?? channel.name ?? 'Unnamed channel'}</AppText>
          <AppBadge size="sm" tone={statusTone} icon={StatusIcon} label={statusLabel} />
        </View>
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.detail}>{primaryLine}</AppText>
        <View style={styles.metaLine}>
          <AppText variant="small" tone="muted" numberOfLines={1} style={styles.idText}>ID: {idLine}</AppText>
          <AppText variant="small" tone="secondary" style={{ fontWeight: fontWeight.semibold }}>{channel.messagesLast24h ?? 0} msgs / 24h</AppText>
        </View>
      </View>
      <ChevronRight color={colors.textMuted} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topbar: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  topbarCopy: { flex: 1, minWidth: 0 },
  metrics: { flexDirection: 'row', gap: spacing.sm + 2, marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  metricCard: {
    borderRadius: radius.lg,
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    overflow: 'hidden',
    padding: spacing.md,
  },
  metricValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  metricLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '600', marginTop: 3 },
  orb: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.pill, position: 'absolute' },
  orbA: { height: 72, right: -20, top: -24, width: 72 },
  orbB: { bottom: -22, height: 56, left: -16, width: 56 },
  searchRow: { flexDirection: 'row', margin: spacing.lg, marginBottom: 0 },
  list: { gap: spacing.sm + 2, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  card: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    padding: spacing.md + 2,
  },
  copy: { flex: 1, marginLeft: spacing.md },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  name: { flexShrink: 1 },
  detail: { marginTop: 3 },
  metaLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: 5 },
  idText: { flex: 1 },
});
