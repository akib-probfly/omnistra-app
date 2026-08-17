import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Eye,
  Megaphone,
  Plus,
  Reply,
  Send,
  XCircle,
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
import { showNotice } from '../components/AppToast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { CardGridSkeleton, ListSkeleton } from '../components/Skeleton';
import {
  campaignUnreachedCount,
  cancelCampaign,
  deleteCampaign,
  fetchBroadcastAnalytics,
  fetchCampaigns,
  formatCampaignDate,
  getCampaignStatusLabel,
  getCampaignStatusTone,
  sendCampaignNow,
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

function percent(value: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
}

function AnalyticsCard({
  label,
  value,
  icon: Icon,
  tone,
  share,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  share?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${tone}18` }]}>
        <Icon color={tone} size={16} />
      </View>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      {share != null ? (
        <Text style={[styles.metricShare, { color: tone }]}>{share}%</Text>
      ) : null}
    </View>
  );
}

export function BroadcastSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<CampaignStatus | 'ALL'>('ALL');
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null);

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
  const analytics = analyticsQuery.data;
  const unreached = analytics
    ? Math.max(0, analytics.totalSent - analytics.totalDelivered - analytics.totalFailed)
    : 0;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['broadcast'] }),
    ]);
  };

  const sendMutation = useMutation({
    mutationFn: sendCampaignNow,
    onSuccess: async () => {
      await invalidate();
      showNotice('Campaign sent');
    },
    onError: (error: Error) => showNotice('Could not send campaign', error.message),
  });
  const cancelMutation = useMutation({
    mutationFn: cancelCampaign,
    onSuccess: async () => {
      await invalidate();
      showNotice('Campaign cancelled');
    },
    onError: (error: Error) => showNotice('Could not cancel campaign', error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: async () => {
      await invalidate();
      setPendingDelete(null);
      showNotice('Campaign deleted');
    },
    onError: (error: Error) => showNotice('Could not delete campaign', error.message),
  });

  const refreshing = listQuery.isRefetching || analyticsQuery.isRefetching;

  if (workspacesQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Broadcast" subtitle="Campaigns and delivery insights" onBack={() => navigation.goBack()} />
        <CardGridSkeleton cards={3} />
        <ListSkeleton rows={5} avatar={false} />
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
              {analytics ? (
                <View style={styles.metricsGrid}>
                  <AnalyticsCard label="Total sent" value={analytics.totalSent} icon={Send} tone="#2563eb" />
                  <AnalyticsCard label="Delivered" value={analytics.totalDelivered} icon={CheckCircle2} tone="#16a34a" share={percent(analytics.totalDelivered, analytics.totalSent)} />
                  <AnalyticsCard label="Read" value={analytics.totalRead} icon={Eye} tone="#4f46e5" share={percent(analytics.totalRead, analytics.totalSent)} />
                  <AnalyticsCard label="Replied" value={analytics.totalReplied} icon={Reply} tone="#d97706" share={percent(analytics.totalReplied, analytics.totalSent)} />
                  <AnalyticsCard label="Failed" value={analytics.totalFailed} icon={XCircle} tone="#dc2626" share={percent(analytics.totalFailed, analytics.totalSent)} />
                  <AnalyticsCard label="Unreached" value={unreached} icon={Clock} tone="#f59e0b" share={percent(unreached, analytics.totalSent)} />
                </View>
              ) : analyticsQuery.isLoading ? (
                <CardGridSkeleton cards={3} />
              ) : null}

              <View style={styles.searchRow}>
                <AppSearchField
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search campaigns"
                  size="sm"
                  tone="background"
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
              <ListSkeleton rows={5} avatar={false} />
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
          renderItem={({ item }) => {
            const tone = getCampaignStatusTone(item.status);
            const canSend = item.status === 'DRAFT' || item.status === 'SCHEDULED';
            const canCancel = item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'SENDING';
            const busy = sendMutation.isPending || cancelMutation.isPending;
            return (
              <Pressable
                style={[styles.campaignCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
                onPress={() => navigation.navigate('BroadcastCampaign', { campaignId: item.id })}
              >
                <View style={styles.campaignTop}>
                  <Text style={[styles.campaignName, { color: colors.primary }]} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.statusText, { color: tone.text }]}>{getCampaignStatusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={[styles.campaignMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.createdBy?.name ?? item.createdBy?.email ?? 'Unknown'} · {formatCampaignDate(item.scheduledAt ?? item.sentAt ?? item.createdAt)}
                </Text>
                <View style={styles.progressRow}>
                  <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                    {item.totalDelivered.toLocaleString()} delivered · {campaignUnreachedCount(item).toLocaleString()} unreached
                  </Text>
                </View>
                <View style={styles.campaignActions}>
                  {canSend ? (
                    <AppButton
                      variant="secondary"
                      icon={Send}
                      label="Send now"
                      disabled={busy}
                      onPress={() => void sendMutation.mutateAsync(item.id)}
                    />
                  ) : null}
                  {canCancel ? (
                    <AppButton
                      variant="ghost"
                      label="Cancel"
                      disabled={busy}
                      onPress={() => void cancelMutation.mutateAsync(item.id)}
                    />
                  ) : null}
                  <AppButton
                    variant="ghost"
                    label="Delete"
                    disabled={item.status === 'SENDING' || busy}
                    onPress={() => setPendingDelete(item)}
                  />
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {listQuery.isFetching && !listQuery.isLoading && !listQuery.isFetchingNextPage ? (
        <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
      ) : null}

      <ConfirmDialog
        visible={Boolean(pendingDelete)}
        title="Delete campaign?"
        body={
          pendingDelete
            ? `${pendingDelete.name} and its analytics, audience, and campaign media will be permanently deleted. Messages already sent will remain in conversations.`
            : ''
        }
        confirmLabel="Delete campaign"
        destructive
        loading={deleteMutation.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete || pendingDelete.status === 'SENDING') return;
          void deleteMutation.mutateAsync(pendingDelete.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  addButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  headerBlock: { paddingBottom: 8, paddingTop: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  metricCard: { borderRadius: 16, borderWidth: 1, padding: 12, width: '31.5%' },
  metricIcon: { alignItems: 'center', borderRadius: 10, height: 28, justifyContent: 'center', width: 28 },
  metricValue: { fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '800', marginTop: 8 },
  metricLabel: { fontSize: 11, marginTop: 2 },
  metricShare: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  searchRow: { paddingHorizontal: 16, paddingTop: 14 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  campaignCard: { borderRadius: 18, borderWidth: 1, marginHorizontal: 16, marginTop: 10, padding: 14 },
  campaignTop: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  campaignName: { flex: 1, fontSize: 15, fontWeight: '800' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },
  campaignMeta: { fontSize: 12, marginTop: 4 },
  progressRow: { marginTop: 8 },
  progressLabel: { fontSize: 12 },
  campaignActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  loadMore: { alignSelf: 'center', marginTop: 16 },
  inlineLoader: { position: 'absolute', right: 18, top: 12 },
});
