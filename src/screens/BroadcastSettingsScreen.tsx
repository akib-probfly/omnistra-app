import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  Megaphone,
  Pause,
  Plus,
  Send,
  type LucideIcon,
} from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { ChannelLogo } from '../components/ChannelLogo';
import { ErrorState } from '../components/ErrorState';
import { CardGridSkeleton, ListSkeleton } from '../components/Skeleton';
import {
  campaignUnreachedCount,
  fetchBroadcastAnalytics,
  fetchCampaigns,
  formatCampaignDate,
  getCampaignStatusLabel,
  getCampaignStatusTone,
  type Campaign,
  type CampaignStatus,
} from '../api/broadcast';
import { fetchMyWorkspaces } from '../api/workspaces';
import { canViewBroadcast } from '../lib/broadcast-access';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { AppButton, AppChip, AppSearchField, EmptyState, ScreenHeader } from '../ui';

const STATUS_FILTERS: Array<{ value: CampaignStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
];

const METRIC_TONES: Array<{ label: string; key: keyof ReturnType<typeof buildMetrics>; colors: [string, string] }> = [
  { label: 'Total sent', key: 'sent', colors: ['#1d4ed8', '#60a5fa'] },
  { label: 'Delivered', key: 'delivered', colors: ['#047857', '#34d399'] },
  { label: 'Read', key: 'read', colors: ['#4338ca', '#818cf8'] },
  { label: 'Replied', key: 'replied', colors: ['#c2410c', '#fb923c'] },
  { label: 'Failed', key: 'failed', colors: ['#b91c1c', '#f87171'] },
  { label: 'Unreached', key: 'unreached', colors: ['#b45309', '#fbbf24'] },
];

function buildMetrics(analytics: { totalSent: number; totalDelivered: number; totalRead: number; totalReplied: number; totalFailed: number }) {
  return {
    sent: analytics.totalSent,
    delivered: analytics.totalDelivered,
    read: analytics.totalRead,
    replied: analytics.totalReplied,
    failed: analytics.totalFailed,
    unreached: Math.max(0, analytics.totalSent - analytics.totalDelivered - analytics.totalFailed),
  };
}

function campaignStatusIcon(status: CampaignStatus): LucideIcon {
  switch (status) {
    case 'SENT':
      return CheckCircle2;
    case 'SENDING':
      return Send;
    case 'FAILED':
      return CircleAlert;
    case 'CANCELLED':
      return Pause;
    default:
      return Clock;
  }
}

function CampaignRow({ campaign, onPress }: { campaign: Campaign; onPress: () => void }) {
  const { colors } = useTheme();
  const tone = getCampaignStatusTone(campaign.status);
  const StatusIcon = campaignStatusIcon(campaign.status);
  const message = campaign.messages?.[0];
  const contentLabel = message?.contentType === 'TEXT' ? 'Text message' : 'Template message';
  const createdBy = campaign.createdBy?.name ?? campaign.createdBy?.email ?? 'Unknown';
  const when = formatCampaignDate(campaign.scheduledAt ?? campaign.sentAt ?? campaign.createdAt);
  const unreached = campaignUnreachedCount(campaign);

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <ChannelLogo type="WHATSAPP" box={48} glyph={24} radius={14} />
      <View style={styles.copy}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{campaign.name}</Text>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <StatusIcon color={tone.text} size={12} />
            <Text style={{ color: tone.text, fontSize: 11, fontWeight: '600' }}>{getCampaignStatusLabel(campaign.status)}</Text>
          </View>
        </View>
        <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
          {createdBy} · {when}
        </Text>
        <View style={styles.metaLine}>
          <Text style={[styles.idText, { color: colors.textMuted }]} numberOfLines={1}>{contentLabel}</Text>
          <Text style={[styles.msg24h, { color: colors.textSecondary }]}>
            {campaign.totalDelivered.toLocaleString()} delivered · {unreached.toLocaleString()} unreached
          </Text>
        </View>
      </View>
      <ChevronRight color={colors.textMuted} size={20} />
    </Pressable>
  );
}

export function BroadcastSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<CampaignStatus | 'ALL'>('ALL');

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspace = workspacesQuery.data?.items?.[0];
  const allowed = canViewBroadcast(workspace);

  const analyticsQuery = useQuery({
    queryKey: ['broadcast', 'analytics'],
    queryFn: fetchBroadcastAnalytics,
    enabled: allowed,
    staleTime: 30_000,
  });

  const listQuery = useInfiniteQuery({
    queryKey: ['broadcast', 'list', deferredSearch, status],
    queryFn: ({ pageParam }) => fetchCampaigns({
      search: deferredSearch || undefined,
      status: status === 'ALL' ? undefined : status,
      channelType: 'WHATSAPP',
      cursor: pageParam,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.pageInfo.hasMore ? lastPage.pageInfo.nextCursor ?? undefined : undefined),
    enabled: allowed,
    staleTime: 20_000,
  });

  const campaigns = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data],
  );
  const metrics = analyticsQuery.data ? buildMetrics(analyticsQuery.data) : null;
  const refreshing = listQuery.isRefetching || analyticsQuery.isRefetching;

  if (workspacesQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Broadcast" subtitle="Campaigns and delivery insights" onBack={() => navigation.goBack()} />
        <CardGridSkeleton cards={3} />
        <ListSkeleton rows={5} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Broadcast" subtitle="Campaigns and delivery insights" onBack={() => navigation.goBack()} />
        <ErrorState message="Broadcast is available to workspace admins and managers." />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Broadcast"
        subtitle="Run, schedule, and analyze campaigns"
        onBack={() => navigation.goBack()}
        right={(
          <Pressable
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('BroadcastCreate')}
            accessibilityLabel="Create campaign"
          >
            <Plus color="#fff" size={18} />
          </Pressable>
        )}
      />

      {listQuery.isError && campaigns.length === 0 ? (
        <ErrorState
          message={listQuery.error instanceof Error ? listQuery.error.message : 'Unable to load campaigns.'}
          onRetry={() => listQuery.refetch()}
        />
      ) : (
        <FlashList
          data={campaigns}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 28) }}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void listQuery.refetch();
                void analyticsQuery.refetch();
              }}
              tintColor={colors.primary}
            />
          )}
          ListHeaderComponent={(
            <View style={styles.headerBlock}>
              {metrics ? (
                <View style={styles.metricsWrap}>
                  {[METRIC_TONES.slice(0, 3), METRIC_TONES.slice(3)].map((row, index) => (
                    <View key={index} style={styles.metrics}>
                      {row.map((metric) => (
                        <LinearGradient
                          key={metric.key}
                          colors={metric.colors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.metricCard}
                        >
                          <View style={[styles.orb, styles.orbA]} />
                          <View style={[styles.orb, styles.orbB]} />
                          <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                            {metrics[metric.key].toLocaleString()}
                          </Text>
                          <Text style={styles.metricLabel}>{metric.label}</Text>
                        </LinearGradient>
                      ))}
                    </View>
                  ))}
                </View>
              ) : analyticsQuery.isLoading ? (
                <CardGridSkeleton cards={3} />
              ) : null}

              <View style={styles.searchRow}>
                <AppSearchField
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search campaigns..."
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {STATUS_FILTERS.map((item) => (
                  <AppChip
                    key={item.value}
                    label={item.label}
                    selected={status === item.value}
                    onPress={() => setStatus(item.value)}
                  />
                ))}
              </ScrollView>
            </View>
          )}
          ListEmptyComponent={
            listQuery.isLoading ? (
              <ListSkeleton rows={5} />
            ) : (
              <EmptyState
                icon={Megaphone}
                title="No campaigns yet"
                message="Create your first WhatsApp broadcast to reach customers at scale."
                action={<AppButton style={{ marginTop: 16 }} icon={Plus} label="Create campaign" onPress={() => navigation.navigate('BroadcastCreate')} />}
              />
            )
          }
          ListFooterComponent={
            listQuery.hasNextPage ? (
              <AppButton
                variant="secondary"
                label={listQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                loading={listQuery.isFetchingNextPage}
                onPress={() => void listQuery.fetchNextPage()}
                style={styles.loadMore}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <CampaignRow
              campaign={item}
              onPress={() => navigation.navigate('BroadcastCampaign', { campaignId: item.id })}
            />
          )}
        />
      )}

      {listQuery.isFetching && !listQuery.isLoading && !listQuery.isFetchingNextPage ? (
        <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  addButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  headerBlock: { paddingBottom: 8, paddingTop: 12 },
  metricsWrap: { gap: 10, paddingHorizontal: 16 },
  metrics: { flexDirection: 'row', gap: 10 },
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
  searchRow: { marginHorizontal: 16, marginTop: 16 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  card: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
  },
  copy: { flex: 1, marginLeft: 12, minWidth: 0 },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  badge: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 3, paddingHorizontal: 8, paddingVertical: 3 },
  detail: { fontSize: 13, marginTop: 3 },
  metaLine: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 5 },
  idText: { flex: 1, fontSize: 11 },
  msg24h: { fontSize: 11, fontWeight: '600' },
  loadMore: { alignSelf: 'center', marginTop: 16 },
  inlineLoader: { position: 'absolute', right: 18, top: 12 },
});
