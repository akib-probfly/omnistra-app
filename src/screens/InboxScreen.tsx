import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Search, Star, Inbox, X } from 'lucide-react-native';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View, RefreshControl, Switch } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ErrorState } from '../components/ErrorState';
import { ChannelLogo } from '../components/ChannelLogo';
import { AuthenticatedImage } from '../components/AuthenticatedImage';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { fetchConversations, fetchConversationCount, fetchAssigneeOptions, type ConversationListItem, type AssigneeFilterOption } from '../api/inbox';
import { getRealtimeConnectionStatus, subscribeRealtimeConnectionStatus } from '../api/realtime';

type Tab = 'all' | 'unread' | 'closed';
const CHANNEL_TYPES = ['WHATSAPP', 'MESSENGER', 'INSTAGRAM', 'EMAIL', 'WEBCHAT', 'SMS', 'TELEGRAM', 'TIKTOK'];

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [unrepliedOnly, setUnrepliedOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [assignment, setAssignment] = useState<'any' | 'assigned' | 'unassigned'>('any');
  const [channelTypes, setChannelTypes] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters = useMemo(() => ({
    status: tab === 'closed' ? 'CLOSED' as const : undefined,
    unreadOnly: tab === 'unread' ? true : undefined,
    unrepliedOnly: unrepliedOnly || undefined,
    starredOnly: starredOnly || undefined,
    assignment: assignment === 'any' ? undefined : assignment,
    channelTypes: channelTypes.length ? channelTypes : undefined,
    assigneeWorkspaceMemberIds: assigneeIds.length ? assigneeIds : undefined,
    search: debouncedSearch.trim() || undefined,
  }), [tab, unrepliedOnly, starredOnly, debouncedSearch, assignment, channelTypes, assigneeIds]);

  const assigneesQuery = useQuery({
    queryKey: ['assignee-filter-options'],
    queryFn: () => fetchAssigneeOptions(),
    enabled: filterOpen,
    staleTime: 60_000,
  });
  const assigneeOptions = assigneesQuery.data ?? [];

  const hasActiveFilters = assignment !== 'any' || channelTypes.length > 0 || assigneeIds.length > 0 || starredOnly || unrepliedOnly;
  const resetFilters = () => {
    setAssignment('any'); setChannelTypes([]); setAssigneeIds([]); setStarredOnly(false); setUnrepliedOnly(false);
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 350);
  };

  const conversations = useInfiniteQuery({
    queryKey: ['conversations', filters],
    queryFn: ({ pageParam }) => fetchConversations({ ...filters, limit: 25, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pageInfo?.hasMore ? (lastPage.pageInfo.nextCursor ?? undefined) : undefined,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const count = useQuery({
    queryKey: ['conversation-count', filters],
    queryFn: () => fetchConversationCount(filters),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const realtimeStatus = useSyncExternalStore(subscribeRealtimeConnectionStatus, getRealtimeConnectionStatus);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['conversation-count'] });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const items = useMemo(() => (conversations.data?.pages ?? []).flatMap((page) => page.items), [conversations.data]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerCopy}>
          <View style={styles.headerTitleLine}>
            <Text style={styles.headerTitle}>Inbox</Text>
            <View style={[styles.statusDot, { backgroundColor: realtimeStatus === 'connected' ? '#22c55e' : realtimeStatus === 'connecting' ? '#f59e0b' : '#ef4444' }]} />
          </View>
          <Text style={styles.headerSubtitle}>{realtimeStatus === 'connected' ? 'Live' : realtimeStatus === 'connecting' ? 'Connecting' : 'Offline'} · new messages update in real time</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable hitSlop={8} onPress={() => setStarredOnly((v) => !v)}><Star color={starredOnly ? '#f59e0b' : '#8ba2c3'} fill={starredOnly ? '#f59e0b' : 'none'} size={20} /></Pressable>
        </View>
      </View>

      <View style={styles.search}>
        <Search color="#8ba2c3" size={18} />
        <TextInput value={search} onChangeText={onSearchChange} placeholder="Search conversations..." placeholderTextColor="#8ba2c3" style={styles.input} />
        {debouncedSearch ? <Pressable onPress={() => { setSearch(''); setDebouncedSearch(''); }}><Text style={styles.clearSearch}>✕</Text></Pressable> : null}
      </View>

      <View style={styles.filters}>
        {(['all', 'unread', 'closed'] as Tab[]).map((key) => {
          const active = tab === key;
          return (
            <Pressable key={key} style={[styles.filterPill, active && styles.filterPillActive]} onPress={() => setTab(key)}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{key === 'all' ? 'All' : key === 'unread' ? 'Unread' : 'Closed'}</Text>
              {key === 'all' ? <Text style={styles.count}>{count.data ?? 0}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.toolbar}>
        <Pressable style={styles.unrepliedToggle} onPress={() => setUnrepliedOnly((v) => !v)}>
          <Switch value={unrepliedOnly} onValueChange={setUnrepliedOnly} trackColor={{ true: '#2563eb' }} thumbColor="#fff" />
          <Text style={styles.unrepliedLabel}>Unreplied only</Text>
        </Pressable>
        <Pressable style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]} onPress={() => setFilterOpen(true)}>
          <Filter color={hasActiveFilters ? '#2563eb' : '#64748b'} size={15} />
          <Text style={hasActiveFilters && styles.filterButtonActiveText}>Filter</Text>
        </Pressable>
      </View>

      {conversations.isLoading ? <ActivityIndicator color="#2563eb" style={styles.loader} />
      : conversations.isError ? <ErrorState message="Unable to load conversations." onRetry={() => conversations.refetch()} />
      : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ConversationRow conversation={item} onPress={() => navigation.navigate('Conversation', { conversationId: item.id, contactName: item.contact.displayName ?? 'Unknown contact', workspaceId: item.workspaceId, channelId: item.channel?.channelId, channelType: item.channel?.channelType })} />}
          ListEmptyComponent={<View style={styles.empty}><Inbox color="#c3d0e2" size={44} /><Text style={styles.emptyTitle}>No conversations</Text><Text style={styles.emptyBody}>New conversations will appear here in real time.</Text></View>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { const last = conversations.data?.pages?.at(-1); if (last?.pageInfo?.hasMore && !conversations.isFetchingNextPage) conversations.fetchNextPage(); }}
          contentContainerStyle={styles.list}
          style={styles.listFill}
        />
      )}

      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.filterOverlay} onPress={() => setFilterOpen(false)}>
          <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>Filters</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8}><X color="#64748b" size={20} /></Pressable>
            </View>

            <Text style={styles.sectionLabel}>Assignment</Text>
            <View style={styles.chipRow}>
              {([['any', 'Any'], ['assigned', 'Assigned'], ['unassigned', 'Unassigned']] as const).map(([value, label]) => (
                <Pressable key={value} style={[styles.chip, assignment === value && styles.chipActive]} onPress={() => setAssignment(value)}>
                  <Text style={[styles.chipText, assignment === value && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Channel</Text>
            <View style={styles.chipRow}>
              {CHANNEL_TYPES.map((type) => {
                const active = channelTypes.includes(type);
                return (
                  <Pressable key={type} style={[styles.chip, active && styles.chipActive]} onPress={() => setChannelTypes((current) => active ? current.filter((t) => t !== type) : [...current, type])}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{type}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Assignee</Text>
            {assigneesQuery.isLoading ? <ActivityIndicator color="#2563eb" /> : (
              <View style={styles.chipRow}>
                {assigneeOptions.map((member) => {
                  const active = assigneeIds.includes(member.workspaceMemberId);
                  return (
                    <Pressable key={member.workspaceMemberId} style={[styles.chip, active && styles.chipActive]} onPress={() => setAssigneeIds((current) => active ? current.filter((id) => id !== member.workspaceMemberId) : [...current, member.workspaceMemberId])}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{member.name ?? member.email}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable style={styles.filterReset} onPress={resetFilters}>
              <Text style={styles.filterResetText}>Clear all filters</Text>
            </Pressable>
            <Pressable style={styles.filterApply} onPress={() => setFilterOpen(false)}>
              <Text style={styles.filterApplyText}>Apply filters</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function getInitials(value?: string | null) {
  const parts = (value ?? '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]);
  return (parts.join('') || '?').toUpperCase();
}

function WindowPulseDot({ expired }: { expired: boolean }) {
  const color = expired ? '#ef4444' : '#22c55e';
  const ringColor = expired ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)';
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <View style={styles.windowDotWrap}>
      <Animated.View style={[styles.windowDotRing, { backgroundColor: ringColor, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <View style={[styles.windowDot, { backgroundColor: color, shadowColor: color }]} />
    </View>
  );
}

function AssigneeBadge({ assignee }: { assignee: ConversationListItem['assignee'] }) {
  if (!assignee) return null;
  const label = (assignee.userName?.trim() || assignee.userEmail?.trim() || 'Agent');
  return (
    <View style={styles.assigneeBadge}>
      {assignee.avatarUrl ? (
        <AuthenticatedImage url={assignee.avatarUrl} resizeMode="cover" style={styles.assigneeImage} />
      ) : (
        <Text style={styles.assigneeInitials}>{getInitials(label)}</Text>
      )}
    </View>
  );
}

function ConversationRow({ conversation, onPress }: { conversation: ConversationListItem; onPress: () => void }) {
  const assigneeName = conversation.assignee?.userName ?? conversation.assignee?.userEmail ?? null;
  const isWhatsAppCustomerWindow = conversation.channel?.channelType === 'WHATSAPP' && conversation.messaging?.policyType === 'CUSTOMER_WINDOW';
  const showWindowDot = isWhatsAppCustomerWindow && conversation.messaging?.windowState !== 'NOT_APPLICABLE';
  const windowExpired = conversation.messaging?.windowState === 'EXPIRED';
  return (
    <Pressable onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(conversation.contact.displayName ?? '?').slice(0, 1).toUpperCase()}</Text>
          {conversation.channel?.channelType ? <View style={styles.channelBadgeWrap}><ChannelLogo type={conversation.channel.channelType} box={22} glyph={13} radius={11} /></View> : null}
        </View>
        <View style={styles.copy}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>{conversation.contact.displayName ?? 'Unknown contact'}</Text>
            {showWindowDot ? <WindowPulseDot expired={windowExpired} /> : null}
            {conversation.unreadCount > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</Text></View> : null}
          </View>
          <Text style={styles.channel} numberOfLines={1}>{conversation.channel?.channelName ?? ''}{assigneeName ? ` · ${assigneeName}` : ''}</Text>
          <Text style={styles.preview} numberOfLines={1}>{conversation.isUnreplied ? '↙ ' : '↗ '}{conversation.lastMessagePreview ?? 'No messages yet'}</Text>
        </View>
        <View style={styles.side}>
          <Text style={styles.time}>{formatTime(conversation.lastMessageAt)}</Text>
          <AssigneeBadge assignee={conversation.assignee} />
        </View>
      </View>
    </Pressable>
  );
}

function formatTime(value: string | null) {
  if (!value) return '';
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#fff', flex: 1 },
  list: { paddingBottom: 16 },
  listFill: { flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, paddingHorizontal: 16 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitleLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  headerTitle: { color: '#111827', fontSize: 24, fontWeight: '800' },
  headerSubtitle: { color: '#8ba2c3', fontSize: 12, marginTop: 4 },
  statusDot: { borderRadius: 5, height: 9, width: 9 },
  headerActions: { flexDirection: 'row', gap: 18, marginLeft: 12 },
  search: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 25, flexDirection: 'row', margin: 12, paddingHorizontal: 14 },
  input: { color: '#17233a', flex: 1, height: 42, marginLeft: 8 },
  clearSearch: { color: '#94a3b8', fontSize: 14, padding: 4 },
  filters: { backgroundColor: '#f1f5f9', borderRadius: 22, flexDirection: 'row', marginHorizontal: 12, padding: 4 },
  filterPill: { alignItems: 'center', borderRadius: 18, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 8 },
  filterPillActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  filterText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#17233a', fontWeight: '700' },
  count: { backgroundColor: '#eef4ff', borderRadius: 10, color: '#2563eb', fontSize: 11, fontWeight: '700', minWidth: 20, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2, textAlign: 'center' },
  toolbar: { alignItems: 'center', borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  unrepliedToggle: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  unrepliedLabel: { color: '#334155', fontSize: 13 },
  filterButton: { alignItems: 'center', borderColor: '#c8dcfc', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 7 },
  filterButtonActive: { borderColor: '#2563eb' },
  filterButtonActiveText: { color: '#2563eb', fontWeight: '700' },
  filterOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', padding: 20, paddingBottom: 32 },
  filterSheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  filterSheetTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  sectionLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8, marginTop: 14, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderColor: '#c8dcfc', borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: '#eef4ff', borderColor: '#2563eb' },
  chipText: { color: '#526987', fontSize: 13 },
  chipTextActive: { color: '#2563eb', fontWeight: '700' },
  filterReset: { alignItems: 'center', marginTop: 22, paddingVertical: 6 },
  filterResetText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  filterApply: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, marginTop: 10, paddingVertical: 14 },
  filterApplyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  row: { borderBottomColor: '#eef2f7', borderBottomWidth: 1, flexDirection: 'row', padding: 12 },  avatar: { alignItems: 'center', backgroundColor: '#f9c43d', borderRadius: 24, height: 48, justifyContent: 'center', position: 'relative', width: 48 },
  avatarText: { color: '#111827', fontSize: 18, fontWeight: '700' },
  channelBadgeWrap: { alignItems: 'center', borderColor: '#fff', borderRadius: 11, borderWidth: 2, bottom: -4, height: 22, justifyContent: 'center', overflow: 'hidden', position: 'absolute', right: -4, width: 22 },
  copy: { flex: 1, marginLeft: 12 },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  name: { color: '#111827', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  windowDotWrap: { alignItems: 'center', height: 12, justifyContent: 'center', width: 12 },
  windowDotRing: { borderRadius: 6, height: 12, position: 'absolute', width: 12 },
  windowDot: { borderRadius: 4, elevation: 3, height: 8, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 5, width: 8 },
  unreadBadge: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, justifyContent: 'center', marginLeft: 'auto', minWidth: 20, paddingHorizontal: 5 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  time: { color: '#8ba2c3', fontSize: 11 },
  channel: { color: '#64748b', flex: 1, fontSize: 12, marginTop: 2 },
  preview: { color: '#8ba2c3', fontSize: 13, marginTop: 3 },
  side: { alignItems: 'flex-end', alignSelf: 'stretch', flexDirection: 'column', justifyContent: 'space-between', marginLeft: 12 },
  assigneeBadge: { alignItems: 'center', backgroundColor: '#fef3c7', borderColor: '#fff', borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', overflow: 'hidden', width: 20 },
  assigneeImage: { height: 20, width: 20 },
  assigneeInitials: { color: '#92400e', fontSize: 9, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { color: '#64748b', fontSize: 15, fontWeight: '700', marginTop: 12 },
  emptyBody: { color: '#94a3b8', fontSize: 13, marginTop: 4, textAlign: 'center' },
  loader: { marginTop: 40 },
});
