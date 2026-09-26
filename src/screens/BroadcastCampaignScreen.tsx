import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Eye,
  PencilLine,
  Reply,
  Send,
  XCircle,
} from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showNotice } from '../components/AppToast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton, ListSkeleton } from '../components/Skeleton';
import {
  campaignUnreachedCount,
  cancelCampaign,
  deleteCampaign,
  fetchCampaign,
  fetchCampaignAudience,
  formatCampaignDate,
  getCampaignStatusLabel,
  getCampaignStatusTone,
  sendCampaignNow,
  type CampaignAudienceMember,
} from '../api/broadcast';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { AppBadge, AppButton, AppChip, AppSearchField, EmptyState, ScreenHeader, toneForStatus } from '../ui';

const AUDIENCE_STATUSES = [
  { value: '', label: 'All' },
  { value: 'SENT', label: 'Sent' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'READ', label: 'Read' },
  { value: 'REPLIED', label: 'Replied' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'UNREACHED', label: 'Unreached' },
];

function percent(value: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
}

function FunnelRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const { colors } = useTheme();
  const share = percent(value, total);
  return (
    <View style={styles.funnelRow}>
      <View style={styles.funnelCopy}>
        <Text style={[styles.funnelLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.funnelValue, { color: colors.text }]}>{value.toLocaleString()} · {share}%</Text>
      </View>
      <View style={[styles.funnelTrack, { backgroundColor: colors.surfaceSecondary }]}>
        <View style={[styles.funnelFill, { backgroundColor: tone, width: `${share}%` }]} />
      </View>
    </View>
  );
}

function AudienceRow({ item }: { item: CampaignAudienceMember }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.audienceRow, { borderBottomColor: colors.separator }]}>
      <View style={styles.audienceCopy}>
        <Text style={[styles.audienceName, { color: colors.text }]} numberOfLines={1}>
          {item.recipientName?.trim() || item.recipientPhone || 'Unknown contact'}
        </Text>
        <Text style={[styles.audienceMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.recipientPhone ?? item.failureReason ?? item.sentTemplateName ?? '—'}
        </Text>
      </View>
      <AppBadge size="sm" tone={toneForStatus(item.status)} label={item.status ?? 'Queued'} />
    </View>
  );
}

export function BroadcastCampaignScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const route = useRoute<RouteProp<SettingsStackParamList, 'BroadcastCampaign'>>();
  const campaignId = route.params.campaignId;
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const campaignQuery = useQuery({
    queryKey: ['broadcast', 'detail', campaignId],
    queryFn: () => fetchCampaign(campaignId),
    staleTime: 15_000,
  });

  const audienceQuery = useInfiniteQuery({
    queryKey: ['broadcast', 'audience', campaignId, deferredSearch, statusFilter],
    queryFn: ({ pageParam }) => fetchCampaignAudience(
      campaignId,
      pageParam,
      20,
      deferredSearch || undefined,
      statusFilter || undefined,
    ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
    staleTime: 10_000,
  });

  const campaign = campaignQuery.data;
  const audience = useMemo(
    () => audienceQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [audienceQuery.data],
  );
  const sentBase = campaign?.totalSent || campaign?.totalRecipients || 0;
  const unreached = campaign ? campaignUnreachedCount(campaign) : 0;
  const canSend = campaign?.status === 'DRAFT' || campaign?.status === 'SCHEDULED';
  const canCancel = campaign?.status === 'DRAFT' || campaign?.status === 'SCHEDULED' || campaign?.status === 'SENDING';
  const canEdit = campaign?.status === 'DRAFT' || campaign?.status === 'SCHEDULED';

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['broadcast'] });
  };

  const sendMutation = useMutation({
    mutationFn: () => sendCampaignNow(campaignId),
    onSuccess: async () => {
      await invalidate();
      showNotice('Campaign sent');
    },
    onError: (error: Error) => showNotice('Could not send campaign', error.message),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelCampaign(campaignId),
    onSuccess: async () => {
      await invalidate();
      showNotice('Campaign cancelled');
    },
    onError: (error: Error) => showNotice('Could not cancel campaign', error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteCampaign(campaignId),
    onSuccess: async () => {
      await invalidate();
      setDeleteOpen(false);
      showNotice('Campaign deleted');
      navigation.goBack();
    },
    onError: (error: Error) => showNotice('Could not delete campaign', error.message),
  });

  const statusTone = campaign ? getCampaignStatusTone(campaign.status) : null;
  const busy = sendMutation.isPending || cancelMutation.isPending || deleteMutation.isPending;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={campaign?.name ?? 'Campaign'}
        subtitle={campaign ? getCampaignStatusLabel(campaign.status) : 'Delivery and engagement'}
        onBack={() => navigation.goBack()}
        titleNumberOfLines={1}
        right={
          canEdit ? (
            <Pressable
              onPress={() => navigation.navigate('BroadcastCreate', { campaignId })}
              hitSlop={8}
              accessibilityLabel="Edit campaign"
            >
              <PencilLine color={colors.primary} size={20} />
            </Pressable>
          ) : null
        }
      />

      {campaignQuery.isLoading ? (
        <FormSkeleton fields={5} />
      ) : campaignQuery.isError || !campaign ? (
        <ErrorState
          message={campaignQuery.error instanceof Error ? campaignQuery.error.message : 'Campaign not found.'}
          onRetry={() => campaignQuery.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 28) }]}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{campaign.name}</Text>
              {statusTone ? (
                <AppBadge size="sm" tone={statusTone} label={getCampaignStatusLabel(campaign.status)} />
              ) : null}
            </View>
            {campaign.description ? (
              <Text style={[styles.body, { color: colors.textSecondary }]}>{campaign.description}</Text>
            ) : null}
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Created {formatCampaignDate(campaign.createdAt)}
              {campaign.scheduledAt ? ` · Scheduled ${formatCampaignDate(campaign.scheduledAt)}` : ''}
              {campaign.sentAt ? ` · Sent ${formatCampaignDate(campaign.sentAt)}` : ''}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Delivery funnel</Text>
            <View style={styles.metricIcons}>
              <View style={styles.metricChip}><Send color={colors.primary} size={14} /><Text style={[styles.metricChipText, { color: colors.text }]}>{campaign.totalSent.toLocaleString()}</Text></View>
              <View style={styles.metricChip}><CheckCircle2 color={colors.success} size={14} /><Text style={[styles.metricChipText, { color: colors.text }]}>{campaign.totalDelivered.toLocaleString()}</Text></View>
              <View style={styles.metricChip}><Eye color={colors.indigo} size={14} /><Text style={[styles.metricChipText, { color: colors.text }]}>{campaign.totalRead.toLocaleString()}</Text></View>
              <View style={styles.metricChip}><Reply color={colors.amber} size={14} /><Text style={[styles.metricChipText, { color: colors.text }]}>{campaign.totalReplied.toLocaleString()}</Text></View>
              <View style={styles.metricChip}><XCircle color={colors.error} size={14} /><Text style={[styles.metricChipText, { color: colors.text }]}>{campaign.totalFailed.toLocaleString()}</Text></View>
              <View style={styles.metricChip}><Clock color={colors.warning} size={14} /><Text style={[styles.metricChipText, { color: colors.text }]}>{unreached.toLocaleString()}</Text></View>
            </View>
            <FunnelRow label="Delivered" value={campaign.totalDelivered} total={sentBase} tone={colors.success} />
            <FunnelRow label="Read" value={campaign.totalRead} total={sentBase} tone={colors.indigo} />
            <FunnelRow label="Replied" value={campaign.totalReplied} total={sentBase} tone={colors.amber} />
            <FunnelRow label="Failed" value={campaign.totalFailed} total={sentBase} tone={colors.error} />
            <FunnelRow label="Unreached" value={unreached} total={sentBase} tone={colors.warning} />
          </View>

          <View style={styles.actions}>
            {canSend ? (
              <AppButton block icon={Send} label="Send now" loading={sendMutation.isPending} disabled={busy} onPress={() => void sendMutation.mutateAsync()} />
            ) : null}
            {canCancel ? (
              <AppButton block variant="secondary" label="Cancel campaign" loading={cancelMutation.isPending} disabled={busy} onPress={() => void cancelMutation.mutateAsync()} />
            ) : null}
            <AppButton
              block
              variant="destructive"
              label="Delete campaign"
              disabled={campaign.status === 'SENDING' || busy}
              onPress={() => setDeleteOpen(true)}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Audience</Text>
            <AppSearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search recipients"
              size="sm"
              tone="background"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {AUDIENCE_STATUSES.map((item) => (
                <AppChip
                  key={item.value || 'all'}
                  label={item.label}
                  selected={statusFilter === item.value}
                  onPress={() => setStatusFilter(item.value)}
                />
              ))}
            </ScrollView>
            {audienceQuery.isLoading ? (
              <ListSkeleton rows={4} avatar={false} />
            ) : audience.length === 0 ? (
              <EmptyState title="No recipients" message="Audience members will appear here after the campaign is prepared." />
            ) : (
              audience.map((item) => <AudienceRow key={item.id} item={item} />)
            )}
            {audienceQuery.hasNextPage ? (
              <AppButton
                variant="secondary"
                label={audienceQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
                loading={audienceQuery.isFetchingNextPage}
                onPress={() => void audienceQuery.fetchNextPage()}
                style={{ marginTop: 12 }}
              />
            ) : null}
          </View>
        </ScrollView>
      )}

      <ConfirmDialog
        visible={deleteOpen}
        title="Delete campaign?"
        body={`${campaign?.name ?? 'This campaign'} and its analytics, audience, and campaign media will be permanently deleted.`}
        confirmLabel="Delete campaign"
        destructive
        loading={deleteMutation.isPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void deleteMutation.mutateAsync()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 12, padding: 16 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  cardTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  meta: { fontSize: 12, marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  metricIcons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metricChip: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  metricChipText: { fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '700' },
  funnelRow: { marginTop: 10 },
  funnelCopy: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  funnelLabel: { fontSize: 12, fontWeight: '600' },
  funnelValue: { fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' },
  funnelTrack: { borderRadius: 999, height: 6, overflow: 'hidden' },
  funnelFill: { borderRadius: 999, height: 6 },
  actions: { gap: 10 },
  chipRow: { gap: 8, paddingVertical: 12 },
  audienceRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 10 },
  audienceCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  audienceName: { fontSize: 14, fontWeight: '700' },
  audienceMeta: { fontSize: 12, marginTop: 2 },
});
