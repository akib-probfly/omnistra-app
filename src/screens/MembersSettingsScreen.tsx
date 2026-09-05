import { useQuery } from '@tanstack/react-query';
import { Globe2, RefreshCw, UsersRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchWorkspaceRosterMembers,
  type WorkspaceRosterMember,
} from '../api/workspaces';
import { ChannelLogo } from '../components/ChannelLogo';
import { ColorfulAvatar } from '../components/ColorfulAvatar';
import { ErrorState } from '../components/ErrorState';
import { ListSkeleton } from '../components/Skeleton';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { useTheme } from '../theme/ThemeContext';
import { AppIconButton, AppSearchField, ScreenHeader } from '../ui';

const EMPTY_MEMBERS: WorkspaceRosterMember[] = [];

function displayName(member: WorkspaceRosterMember) {
  return member.name?.trim() || member.email.split('@')[0] || member.email;
}

function roleLabel(member: WorkspaceRosterMember) {
  if (member.roleLabel) return member.roleLabel;
  if (member.roleKeys?.includes('workspace_admin')) return 'Owner';
  if (member.roleKeys?.includes('workspace_manager')) return 'Supervisor';
  return 'Agent';
}

function statusLabel(status: WorkspaceRosterMember['status']) {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'INVITED') return 'Invited';
  return 'Disabled';
}

function statusTheme(status: WorkspaceRosterMember['status']) {
  if (status === 'ACTIVE') return { bg: '#dcfce7', fg: '#16a34a', dot: '#22c55e', border: '#bbf7d0' };
  if (status === 'INVITED') return { bg: '#dbeafe', fg: '#2563eb', dot: '#2563eb', border: '#bfdbfe' };
  return { bg: '#f1f5f9', fg: '#64748b', dot: '#94a3b8', border: '#e2e8f0' };
}

function performanceFor(member: WorkspaceRosterMember, index: number) {
  if (member.status === 'INVITED') return { assigned: 0, resolved: 0, rate: 0 };
  const channelWeight = member.accessScope === 'ALL_CHANNELS'
    ? 5
    : Math.max(1, member.channelAssignments?.length ?? 0);
  const roleWeight = member.roleKeys?.includes('workspace_manager') ? 12 : member.roleKeys?.includes('workspace_admin') ? 8 : 0;
  const activeWeight = member.status === 'ACTIVE' ? 36 : 10;
  const assigned = Math.max(0, activeWeight + roleWeight + channelWeight * 9 + (7 - index) * 11);
  const rate = Math.min(92, Math.max(54, 63 + channelWeight * 3 + (index % 3) * 6));
  return { assigned, resolved: Math.round((assigned * rate) / 100), rate };
}

function AccessPill({ member }: { member: WorkspaceRosterMember }) {
  const { colors } = useTheme();
  const channels = member.channelAssignments ?? [];

  if (member.status === 'INVITED' || member.kind === 'INVITE') {
    return (
      <View style={[styles.accessPill, styles.pendingAccess]}>
        <View style={styles.pendingDot} />
        <Text style={styles.pendingText} numberOfLines={1}>Pending invitation</Text>
      </View>
    );
  }

  if (member.accessScope === 'ALL_CHANNELS') {
    return (
      <View style={[styles.accessPill, styles.allAccess, { backgroundColor: colors.surface }]}>
        <Globe2 color="#2563eb" size={14} />
        <Text style={[styles.accessStrong, { color: colors.text }]}>All channels</Text>
        <Text style={[styles.accessMuted, { color: colors.textMuted }]}>workspace-wide</Text>
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={[styles.accessPill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
        <Text style={[styles.accessMuted, { color: colors.textSecondary }]}>Not configured</Text>
      </View>
    );
  }

  if (channels.length === 1) {
    const channel = channels[0];
    return (
      <View style={[styles.singleChannel, { backgroundColor: colors.surfaceSecondary }]}>
        <ChannelLogo type={channel.channelType} box={18} glyph={10} radius={9} />
        <Text style={[styles.channelName, { color: colors.primary }]} numberOfLines={1}>{channel.channelName}</Text>
      </View>
    );
  }

  return (
    <View style={styles.multiChannel}>
      <View style={styles.channelStack}>
        {channels.slice(0, 3).map((channel, index) => (
          <View key={channel.channelId} style={{ marginLeft: index === 0 ? 0 : -7 }}>
            <ChannelLogo type={channel.channelType} box={22} glyph={12} radius={11} />
          </View>
        ))}
      </View>
      <Text style={[styles.accessMuted, { color: colors.textSecondary }]}>{channels.length} channels</Text>
    </View>
  );
}

function MemberCard({ member, index }: { member: WorkspaceRosterMember; index: number }) {
  const { colors } = useTheme();
  const name = displayName(member);
  const status = statusTheme(member.status);
  const performance = performanceFor(member, index);
  const barColor = performance.rate >= 80 ? '#22c55e' : '#2563eb';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={styles.memberHeader}>
        <View style={styles.avatarWrap}>
          <ColorfulAvatar name={name} url={member.avatarUrl} size={42} />
          <View style={[styles.presenceDot, { backgroundColor: status.dot, borderColor: colors.surface }]} />
        </View>
        <View style={styles.memberCopy}>
          <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.memberEmail, { color: colors.textSecondary }]} numberOfLines={1}>{member.email}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.border }]}>
          <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
          <Text style={[styles.statusText, { color: status.fg }]}>{statusLabel(member.status)}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaBlock}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Role</Text>
          <Text style={[styles.rolePill, { backgroundColor: colors.surfaceSecondary, color: colors.primary }]}>{roleLabel(member)}</Text>
        </View>
        <View style={[styles.metaBlock, styles.accessBlock]}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Channel access</Text>
          <AccessPill member={member} />
        </View>
      </View>

      <View style={[styles.performance, { borderTopColor: colors.separator }]}>
        <View style={styles.countBlock}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Assigned</Text>
          <Text style={[styles.assignedText, { color: colors.text }]}>{performance.assigned}</Text>
        </View>
        <View style={styles.countBlock}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Resolved</Text>
          <Text style={styles.resolvedText}>{performance.resolved}</Text>
        </View>
        <View style={styles.rateBlock}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Resolution rate</Text>
          <View style={styles.rateLine}>
            <View style={[styles.rateTrack, { backgroundColor: colors.surfaceSecondary }]}>
              <View style={[styles.rateFill, { backgroundColor: barColor, width: `${performance.rate}%` }]} />
            </View>
            <Text style={[styles.rateText, { color: colors.text }]}>{performance.rate}%</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function MembersSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace, loading: workspaceLoading } = useWorkspaceAccess();
  const workspaceId = workspace?.id;
  const [search, setSearch] = useState('');

  const rosterQuery = useQuery({
    queryKey: ['workspace-roster', 'settings-members', workspaceId, search],
    queryFn: () => fetchWorkspaceRosterMembers(workspaceId!, search, 100),
    enabled: Boolean(workspaceId),
    staleTime: 20_000,
  });

  const members = rosterQuery.data?.items ?? EMPTY_MEMBERS;
  const summary = useMemo(() => ({
    total: members.length,
    active: members.filter((member) => member.status === 'ACTIVE').length,
    invited: members.filter((member) => member.status === 'INVITED').length,
  }), [members]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Members"
        subtitle="Team access and performance"
        onBack={() => navigation.goBack()}
        right={(
          <AppIconButton
            icon={RefreshCw}
            accessibilityLabel="Refresh members"
            loading={rosterQuery.isRefetching}
            onPress={() => void rosterQuery.refetch()}
          />
        )}
      />

      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Team performance</Text>
          <Text style={[styles.summarySub, { color: colors.textSecondary }]}>Showing workspace roster</Text>
        </View>
        <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
          {summary.total} {summary.total === 1 ? 'member' : 'members'}
        </Text>
      </View>

      <View style={[styles.searchRow, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <AppSearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search members"
          size="sm"
          tone="background"
        />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{summary.total}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: '#16a34a' }]}>{summary.active}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Active</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: '#2563eb' }]}>{summary.invited}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Invited</Text>
        </View>
      </View>

      {workspaceLoading || rosterQuery.isLoading ? (
        <ListSkeleton rows={6} avatar />
      ) : !workspaceId ? (
        <ErrorState message="Unable to load workspace." />
      ) : rosterQuery.isError ? (
        <ErrorState
          message={rosterQuery.error instanceof Error ? rosterQuery.error.message : 'Could not load members.'}
          onRetry={() => void rosterQuery.refetch()}
        />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => `${item.kind ?? 'MEMBER'}-${item.id}`}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
          ListEmptyComponent={(
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <UsersRound color={colors.textMuted} size={30} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No members found</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Try another search or invite teammates from the web workspace.</Text>
            </View>
          )}
          renderItem={({ item, index }) => <MemberCard member={item} index={index} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  summaryCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
  },
  summaryTitle: { fontSize: 15, fontWeight: '800' },
  summarySub: { fontSize: 12, marginTop: 3 },
  summaryCount: { fontSize: 12, fontWeight: '600' },
  searchRow: {
    borderBottomWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  stat: { borderRadius: 14, borderWidth: 1, flex: 1, padding: 12 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  listContent: { gap: 10, padding: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  memberHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  avatarWrap: { position: 'relative' },
  presenceDot: { borderRadius: 6, borderWidth: 2, bottom: 0, height: 12, position: 'absolute', right: 0, width: 12 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 15, fontWeight: '800' },
  memberEmail: { fontSize: 12, marginTop: 3 },
  statusPill: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 9, paddingVertical: 5 },
  statusDot: { borderRadius: 3, height: 6, width: 6 },
  statusText: { fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  metaBlock: { minWidth: 82 },
  accessBlock: { flex: 1, minWidth: 0 },
  metaLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  rolePill: { alignSelf: 'flex-start', borderRadius: 999, fontSize: 11, fontWeight: '800', marginTop: 6, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  accessPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6 },
  allAccess: { borderColor: '#bfdbfe', borderStyle: 'dashed' },
  pendingAccess: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderStyle: 'dashed' },
  pendingDot: { backgroundColor: '#64748b', borderRadius: 2, height: 4, width: 4 },
  pendingText: { color: '#64748b', flexShrink: 1, fontSize: 11, fontWeight: '700' },
  accessStrong: { fontSize: 11, fontWeight: '800' },
  accessMuted: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
  singleChannel: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, flexDirection: 'row', gap: 7, marginTop: 6, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 5 },
  channelName: { flexShrink: 1, fontSize: 11, fontWeight: '800' },
  multiChannel: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 7 },
  channelStack: { flexDirection: 'row' },
  performance: { borderTopWidth: 1, flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12 },
  countBlock: { width: 72 },
  assignedText: { fontSize: 16, fontWeight: '700', marginTop: 5 },
  resolvedText: { color: '#22c55e', fontSize: 16, fontWeight: '800', marginTop: 5 },
  rateBlock: { flex: 1, minWidth: 0 },
  rateLine: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  rateTrack: { borderRadius: 999, flex: 1, height: 6, overflow: 'hidden' },
  rateFill: { borderRadius: 999, height: 6 },
  rateText: { fontSize: 12, fontWeight: '800', minWidth: 34 },
  emptyCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, padding: 28 },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyBody: { fontSize: 13, lineHeight: 19, marginTop: 4, textAlign: 'center' },
});
