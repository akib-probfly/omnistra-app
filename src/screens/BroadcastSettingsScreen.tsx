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
import type { ThemeColors } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppChip, AppSearchField, EmptyState, ScreenHeader } from '../ui';

const STATUS_FILTERS: Array<{ value: CampaignStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
];

const METRIC_TONES: Array<{ label: string; key: keyof ReturnType<typeof buildMetrics> }> = [
  { label: 'Total sent', key: 'sent' },
  { label: 'Delivered', key: 'delivered' },
  { label: 'Read', key: 'read' },
  { label: 'Replied', key: 'replied' },
  { label: 'Failed', key: 'failed' },
  { label: 'Unreached', key: 'unreached' },
];

function metricGradient(key: keyof ReturnType<typeof buildMetrics>, colors: ThemeColors): [string, string] {
  switch (key) {
    case 'delivered': return [colors.success, colors.primary];
    case 'read': return [colors.indigo, colors.primary];
    case 'replied': return [colors.warning, colors.amber];
    case 'failed': return [colors.error, colors.dangerBorder];
    case 'unreached': return [colors.amber, colors.warning];
    default: return [colors.primary, colors.primaryBorder];
  }
}

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
  const styles = useBroadcastStyles(colors);
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
          <AppBadge size="sm" tone={tone} icon={StatusIcon} label={getCampaignStatusLabel(campaign.status)} />
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
  const styles = useBroadcastStyles(colors);
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
            <Plus color={colors.primaryText} size={18} />
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
                          colors={metricGradient(metric.key, colors)}
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
                action={<AppButton style={{ marginTop: spacing.lg }} icon={Plus} label="Create campaign" onPress={() => navigation.navigate('BroadcastCreate')} />}
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

function useBroadcastStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1 },
  addButton: { alignItems: 'center', borderRadius: radius.lg, height: 36, justifyContent: 'center', width: 36 },
  headerBlock: { paddingBottom: spacing.sm, paddingTop: spacing.md },
  metricsWrap: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metricCard: {
    borderRadius: radius.lg,
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    overflow: 'hidden',
    padding: spacing.md,
  },
  metricValue: { color: colors.primaryText, fontSize: fontSize.title, fontWeight: fontWeight.extrabold },
  metricLabel: { color: colors.primaryText, fontSize: fontSize.tiny, fontWeight: fontWeight.semibold, marginTop: 3, opacity: 0.88 },
  orb: { backgroundColor: colors.primaryText, borderRadius: radius.pill, opacity: 0.16, position: 'absolute' },
  orbA: { height: 72, right: -20, top: -24, width: 72 },
  orbB: { bottom: -22, height: 56, left: -16, width: 56 },
  searchRow: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  copy: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: fontSize.body, fontWeight: fontWeight.bold },
  detail: { fontSize: fontSize.caption, marginTop: 3 },
  metaLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', marginTop: 5 },
  idText: { flex: 1, fontSize: fontSize.tiny },
  msg24h: { fontSize: fontSize.tiny, fontWeight: fontWeight.semibold },
  loadMore: { alignSelf: 'center', marginTop: spacing.lg },
  inlineLoader: { position: 'absolute', right: 18, top: 12 },
  });
}
