import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Filter, Image as ImageIcon, Inbox, Mail, MessageSquareText, Mic, Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, Search, Star, Video, X } from 'lucide-react-native';
import { ActivityIndicator, Animated, Easing, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppToggle } from '../components/AppToggle';
import { ErrorState } from '../components/ErrorState';
import { ChannelLogo, channelBrandColor } from '../components/ChannelLogo';
import { AuthenticatedImage } from '../components/AuthenticatedImage';
import { InboxCallsPane } from '../components/InboxCallsPane';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { fetchConversations, fetchConversationCount, fetchConversationUnreadCount, fetchAssigneeOptions, type ConversationCallSession, type ConversationListItem } from '../api/inbox';
import { fetchWorkspaceTags } from '../api/conversationDetails';
import {
  getCallPreviewChipConfig,
  getConversationLastInteractionPresentation,
  isAudioPreview,
  isImagePreview,
  isVideoPreview,
  isVoiceNotePreview,
} from '../lib/conversation-last-interaction';
import { applyUnreadOverrideToPage } from '../lib/unread-count-override';
import { getRealtimeConnectionStatus, subscribeRealtimeConnectionStatus } from '../api/realtime';

type SidebarTab = 'chats' | 'calls';
type Tab = 'all' | 'unread' | 'closed';
type FilterLayer = 'channels' | 'tags' | 'users' | 'more';
type AssignmentFilter = 'any' | 'assigned' | 'unassigned';

const CHANNEL_TYPES = ['WHATSAPP', 'MESSENGER', 'INSTAGRAM', 'EMAIL', 'WEBCHAT', 'SMS', 'TELEGRAM', 'TIKTOK'] as const;
const FILTER_LAYERS: Array<{ id: FilterLayer; label: string }> = [
  { id: 'channels', label: 'Channels' },
  { id: 'tags', label: 'Tags' },
  { id: 'users', label: 'Users' },
  { id: 'more', label: 'More' },
];

function getChannelFilterLabel(channelType: string) {
  if (channelType === 'MESSENGER') return 'Facebook';
  return channelType.charAt(0) + channelType.slice(1).toLowerCase();
}


export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chats');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [unrepliedOnly, setUnrepliedOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterLayer, setFilterLayer] = useState<FilterLayer>('channels');
  const [assignment, setAssignment] = useState<AssignmentFilter>('any');
  const [channelTypes, setChannelTypes] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagTextInput, setTagTextInput] = useState('');
  const [debouncedTagText, setDebouncedTagText] = useState('');
  const [userSearchInput, setUserSearchInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagTextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const includeEmpty = Boolean(
    debouncedSearch.trim()
    || selectedTagIds.length
    || debouncedTagText.trim()
    || channelTypes.length
    || assigneeIds.length
    || assignment !== 'any'
    || starredOnly
    || unrepliedOnly,
  );

  const filters = useMemo(() => ({
    status: tab === 'closed' ? 'CLOSED' as const : undefined,
    unreadOnly: tab === 'unread' ? true : undefined,
    unrepliedOnly: unrepliedOnly || undefined,
    starredOnly: starredOnly || undefined,
    assignment: assignment === 'any' ? undefined : assignment,
    channelTypes: channelTypes.length ? channelTypes : undefined,
    assigneeWorkspaceMemberIds: assigneeIds.length ? assigneeIds : undefined,
    tagIds: selectedTagIds.length ? selectedTagIds : undefined,
    tagText: debouncedTagText.trim() || undefined,
    search: debouncedSearch.trim() || undefined,
    includeEmpty: includeEmpty || undefined,
  }), [tab, unrepliedOnly, starredOnly, debouncedSearch, assignment, channelTypes, assigneeIds, selectedTagIds, debouncedTagText, includeEmpty]);

  const advancedFilterParams = useMemo(() => ({
    search: debouncedSearch.trim() || undefined,
    tagIds: selectedTagIds.length ? selectedTagIds : undefined,
    tagText: debouncedTagText.trim() || undefined,
    channelTypes: channelTypes.length ? channelTypes : undefined,
    assigneeWorkspaceMemberIds: assigneeIds.length ? assigneeIds : undefined,
    assignment: assignment === 'any' ? undefined : assignment,
    starredOnly: starredOnly || undefined,
  }), [debouncedSearch, selectedTagIds, debouncedTagText, channelTypes, assigneeIds, assignment, starredOnly]);

  const assigneesQuery = useQuery({
    queryKey: ['assignee-filter-options'],
    queryFn: () => fetchAssigneeOptions(),
    enabled: filterOpen,
    staleTime: 60_000,
  });
  const assigneeOptions = assigneesQuery.data ?? [];
  const visibleAssigneeOptions = useMemo(() => {
    const query = userSearchInput.trim().toLowerCase();
    if (!query) return assigneeOptions;
    return assigneeOptions.filter((member) => `${member.name ?? ''} ${member.email}`.toLowerCase().includes(query));
  }, [assigneeOptions, userSearchInput]);

  const tagsQuery = useQuery({
    queryKey: ['workspace-tags'],
    queryFn: () => fetchWorkspaceTags(),
    enabled: filterOpen,
    staleTime: 60_000,
  });
  const workspaceTags = tagsQuery.data?.items ?? [];
  const visibleTagOptions = useMemo(() => {
    const query = tagTextInput.trim().toLowerCase();
    const active = workspaceTags.filter((tag) => selectedTagIds.includes(tag.id));
    const rest = workspaceTags.filter((tag) => {
      if (selectedTagIds.includes(tag.id)) return false;
      if (!query) return true;
      return tag.text.toLowerCase().includes(query);
    });
    return [...active, ...rest];
  }, [workspaceTags, selectedTagIds, tagTextInput]);

  const hasTagFilters = selectedTagIds.length > 0 || debouncedTagText.trim().length > 0;
  const hasAdvancedFilters = hasTagFilters || channelTypes.length > 0 || assigneeIds.length > 0 || assignment !== 'any' || starredOnly;
  const canClearFilters = hasAdvancedFilters || unrepliedOnly;

  const resetFilters = () => {
    setAssignment('any');
    setChannelTypes([]);
    setAssigneeIds([]);
    setSelectedTagIds([]);
    setTagTextInput('');
    setDebouncedTagText('');
    setUserSearchInput('');
    setStarredOnly(false);
    setUnrepliedOnly(false);
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 500);
  };

  const onTagTextChange = (value: string) => {
    setTagTextInput(value);
    if (tagTextTimer.current) clearTimeout(tagTextTimer.current);
    tagTextTimer.current = setTimeout(() => setDebouncedTagText(value), 250);
  };

  const conversations = useInfiniteQuery({
    queryKey: ['conversations', filters],
    queryFn: async ({ pageParam }) => {
      const result = await fetchConversations({ ...filters, limit: 25, cursor: pageParam });
      return { ...result, items: applyUnreadOverrideToPage(result.items) };
    },
    enabled: sidebarTab === 'chats',
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pageInfo?.hasMore ? (lastPage.pageInfo.nextCursor ?? undefined) : undefined,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const unreadCount = useQuery({
    queryKey: ['inbox-unread-count', advancedFilterParams],
    queryFn: () => fetchConversationUnreadCount(advancedFilterParams),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const closedCount = useQuery({
    queryKey: ['conversation-count', { ...filters, status: 'CLOSED' as const }],
    queryFn: () => fetchConversationCount({ ...filters, status: 'CLOSED' }),
    enabled: sidebarTab === 'chats' && tab === 'closed',
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const openCallConversation = useCallback((session: ConversationCallSession) => {
    const contactName = session.conversation?.contact.displayName
      ?? session.recipientDisplayName
      ?? session.conversation?.contact.primaryPhone
      ?? session.recipientIdentityValue
      ?? 'Unknown contact';
    navigation.navigate('Conversation', {
      conversationId: session.conversationId,
      contactName,
      workspaceId: session.conversation?.workspaceId ?? session.workspaceId,
      channelId: session.conversation?.channel.channelId,
      channelType: session.conversation?.channel.channelType,
    });
  }, [navigation]);

  const realtimeStatus = useSyncExternalStore(subscribeRealtimeConnectionStatus, getRealtimeConnectionStatus);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['conversation-count'] });
      await queryClient.invalidateQueries({ queryKey: ['inbox-unread-count'] });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const items = useMemo(() => (conversations.data?.pages ?? []).flatMap((page) => page.items), [conversations.data]);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (tagTextTimer.current) clearTimeout(tagTextTimer.current);
  }, []);

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
      </View>

      <View style={styles.sidebarTabs}>
        <Pressable style={styles.sidebarTab} onPress={() => setSidebarTab('chats')}>
          <MessageSquareText color={sidebarTab === 'chats' ? '#2563eb' : '#94a3b8'} size={16} />
          <Text style={[styles.sidebarTabText, sidebarTab === 'chats' && styles.sidebarTabTextActive]}>Chats</Text>
          <Text style={styles.sidebarTabCount}>{unreadCount.data ?? 0}</Text>
          {sidebarTab === 'chats' ? <View style={styles.sidebarTabUnderline} /> : null}
        </Pressable>
        <Pressable style={styles.sidebarTab} onPress={() => setSidebarTab('calls')}>
          <Phone color={sidebarTab === 'calls' ? '#2563eb' : '#94a3b8'} size={16} />
          <Text style={[styles.sidebarTabText, sidebarTab === 'calls' && styles.sidebarTabTextActive]}>Calls</Text>
          {sidebarTab === 'calls' ? <View style={styles.sidebarTabUnderline} /> : null}
        </Pressable>
      </View>

      {sidebarTab === 'calls' ? (
        <InboxCallsPane onOpenConversation={openCallConversation} />
      ) : (
        <>
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
                </Pressable>
              );
            })}
          </View>

          {tab === 'closed' ? (
            <View style={styles.closedBanner}>
              <Text style={styles.closedBannerTitle}>
                {closedCount.isLoading ? 'Loading closed conversation count...' : `${new Intl.NumberFormat().format(closedCount.data ?? 0)} closed conversations`}
              </Text>
              <Text style={styles.closedBannerBody}>Scroll the list to load more pages.</Text>
            </View>
          ) : null}

          <View style={styles.toolbar}>
            <Pressable
              style={styles.unrepliedToggle}
              onPress={() => setUnrepliedOnly((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: unrepliedOnly }}
              accessibilityLabel="Unreplied only"
            >
              <AppToggle value={unrepliedOnly} variant="sidebar" />
              <Text style={styles.unrepliedLabel}>Unreplied only</Text>
            </Pressable>
            <Pressable style={[styles.filterButton, hasAdvancedFilters && styles.filterButtonActive]} onPress={() => setFilterOpen(true)}>
              <Filter color={hasAdvancedFilters ? '#2563eb' : '#64748b'} size={15} />
              <Text style={[styles.filterButtonText, hasAdvancedFilters && styles.filterButtonActiveText]}>Filter</Text>
              {hasAdvancedFilters ? <View style={styles.filterActiveDot} /> : null}
            </Pressable>
          </View>

          {conversations.isLoading ? <ActivityIndicator color="#2563eb" style={styles.loader} />
          : conversations.isError ? <ErrorState message="Unable to load conversations." onRetry={() => conversations.refetch()} />
          : (
            <FlatList
              style={styles.listFill}
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ConversationRow
                  conversation={item}
                  onPress={() => navigation.navigate('Conversation', {
                    conversationId: item.id,
                    contactName: item.contact.displayName ?? 'Unknown contact',
                    workspaceId: item.workspaceId,
                    channelId: item.channel?.channelId,
                    channelType: item.channel?.channelType,
                  })}
                />
              )}
              ListEmptyComponent={(
                <View style={styles.empty}>
                  <Inbox color="#c3d0e2" size={44} />
                  <Text style={styles.emptyTitle}>No conversations</Text>
                  <Text style={styles.emptyBody}>
                    {canClearFilters || debouncedSearch.trim()
                      ? 'No conversations match the current filters.'
                      : 'New conversations will appear here in real time.'}
                  </Text>
                  {canClearFilters || debouncedSearch.trim() ? (
                    <Pressable
                      style={styles.emptyClearButton}
                      onPress={() => {
                        resetFilters();
                        setSearch('');
                        setDebouncedSearch('');
                      }}
                    >
                      <Text style={styles.emptyClearButtonText}>Clear filters</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
              onEndReachedThreshold={0.4}
              onEndReached={() => { const last = conversations.data?.pages?.at(-1); if (last?.pageInfo?.hasMore && !conversations.isFetchingNextPage) conversations.fetchNextPage(); }}
              contentContainerStyle={styles.list}
              removeClippedSubviews={false}
              initialNumToRender={12}
              windowSize={8}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
            />
          )}
        </>
      )}

      <Modal visible={filterOpen && sidebarTab === 'chats'} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.filterOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setFilterOpen(false)} />
          <View style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>Filters</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8}><X color="#64748b" size={20} /></Pressable>
            </View>

            <View style={styles.filterLayerTabs}>
              {FILTER_LAYERS.map((layer) => {
                const active = filterLayer === layer.id;
                return (
                  <Pressable key={layer.id} style={[styles.filterLayerTab, active && styles.filterLayerTabActive]} onPress={() => setFilterLayer(layer.id)}>
                    <Text style={[styles.filterLayerTabText, active && styles.filterLayerTabTextActive]}>{layer.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView style={styles.filterLayerBody} contentContainerStyle={styles.filterLayerContent} keyboardShouldPersistTaps="handled">
              {filterLayer === 'channels' ? (
                <View style={styles.chipRow}>
                  {CHANNEL_TYPES.map((type) => {
                    const active = channelTypes.includes(type);
                    const brand = channelBrandColor(type);
                    return (
                      <Pressable
                        key={type}
                        style={[
                          styles.chip,
                          styles.channelChip,
                          active && {
                            backgroundColor: `${brand}14`,
                            borderColor: brand,
                          },
                        ]}
                        onPress={() => setChannelTypes((current) => active ? current.filter((t) => t !== type) : [...current, type])}
                      >
                        <ChannelLogo type={type} box={22} glyph={13} radius={7} />
                        <Text style={[styles.chipText, active && { color: brand, fontWeight: '700' }]}>
                          {getChannelFilterLabel(type)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {filterLayer === 'tags' ? (
                <>
                  <View style={styles.inlineSearch}>
                    <Search color="#8ba2c3" size={16} />
                    <TextInput
                      value={tagTextInput}
                      onChangeText={onTagTextChange}
                      placeholder="Search tags..."
                      placeholderTextColor="#8ba2c3"
                      style={styles.inlineSearchInput}
                    />
                  </View>
                  <Text style={styles.selectedCount}>{selectedTagIds.length} selected</Text>
                  {tagsQuery.isLoading ? <ActivityIndicator color="#2563eb" /> : (
                    <View style={styles.optionList}>
                      {visibleTagOptions.map((tag) => {
                        const active = selectedTagIds.includes(tag.id);
                        return (
                          <Pressable
                            key={tag.id}
                            style={[styles.optionRow, active && styles.optionRowActive]}
                            onPress={() => setSelectedTagIds((current) => active ? current.filter((id) => id !== tag.id) : [...current, tag.id])}
                          >
                            <View style={[styles.tagDot, { backgroundColor: tag.color || '#94a3b8' }]} />
                            <Text style={[styles.optionRowText, active && styles.optionRowTextActive]} numberOfLines={1}>{tag.text}</Text>
                          </Pressable>
                        );
                      })}
                      {!visibleTagOptions.length ? <Text style={styles.emptyFilterHint}>No tags match the current search</Text> : null}
                    </View>
                  )}
                </>
              ) : null}

              {filterLayer === 'users' ? (
                <>
                  <View style={styles.inlineSearch}>
                    <Search color="#8ba2c3" size={16} />
                    <TextInput
                      value={userSearchInput}
                      onChangeText={setUserSearchInput}
                      placeholder="Search assignees..."
                      placeholderTextColor="#8ba2c3"
                      style={styles.inlineSearchInput}
                    />
                  </View>
                  {assigneesQuery.isLoading ? <ActivityIndicator color="#2563eb" /> : assigneesQuery.isError ? (
                    <Text style={styles.emptyFilterHint}>Could not load assignee options.</Text>
                  ) : (
                    <View style={styles.optionList}>
                      {visibleAssigneeOptions.map((member) => {
                        const active = assigneeIds.includes(member.workspaceMemberId);
                        return (
                          <Pressable
                            key={member.workspaceMemberId}
                            style={[styles.optionRow, active && styles.optionRowActive]}
                            onPress={() => setAssigneeIds((current) => active ? current.filter((id) => id !== member.workspaceMemberId) : [...current, member.workspaceMemberId])}
                          >
                            <Text style={[styles.optionRowText, active && styles.optionRowTextActive]} numberOfLines={1}>{member.name ?? member.email}</Text>
                          </Pressable>
                        );
                      })}
                      {!visibleAssigneeOptions.length ? <Text style={styles.emptyFilterHint}>No assignee options match the current search</Text> : null}
                    </View>
                  )}
                </>
              ) : null}

              {filterLayer === 'more' ? (
                <>
                  <Text style={styles.sectionLabel}>Assignment</Text>
                  <View style={styles.assignmentSegment}>
                    {([['any', 'Any'], ['assigned', 'Assigned'], ['unassigned', 'Unassigned']] as const).map(([value, label]) => (
                      <Pressable key={value} style={[styles.assignmentOption, assignment === value && styles.assignmentOptionActive]} onPress={() => setAssignment(value)}>
                        <Text style={[styles.assignmentOptionText, assignment === value && styles.assignmentOptionTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Pressable
                    style={styles.switchRow}
                    onPress={() => setStarredOnly((value) => !value)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: starredOnly }}
                    accessibilityLabel="Starred only"
                  >
                    <View style={styles.switchRowCopy}>
                      <Star color="#f59e0b" size={16} fill={starredOnly ? '#f59e0b' : 'none'} />
                      <Text style={styles.switchRowLabel}>Starred only</Text>
                    </View>
                    <AppToggle value={starredOnly} tone="amber" />
                  </Pressable>

                  <Pressable
                    style={styles.switchRow}
                    onPress={() => setUnrepliedOnly((value) => !value)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: unrepliedOnly }}
                    accessibilityLabel="Unreplied only"
                  >
                    <View style={styles.switchRowCopy}>
                      <Mail color="#2563eb" size={16} />
                      <Text style={styles.switchRowLabel}>Unreplied only</Text>
                    </View>
                    <AppToggle value={unrepliedOnly} tone="blue" />
                  </Pressable>
                </>
              ) : null}
            </ScrollView>

            <Pressable style={[styles.filterReset, !canClearFilters && styles.filterResetDisabled]} onPress={resetFilters} disabled={!canClearFilters}>
              <Text style={[styles.filterResetText, !canClearFilters && styles.filterResetTextDisabled]}>Clear all</Text>
            </Pressable>
            <Pressable style={styles.filterApply} onPress={() => setFilterOpen(false)}>
              <Text style={styles.filterApplyText}>Apply filters</Text>
            </Pressable>
          </View>
        </View>
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

function hexWithAlpha(color: string | null | undefined, alphaHex = '18') {
  const value = (color ?? '#64748b').trim();
  if (/^#([0-9a-fA-F]{6})$/.test(value)) return `${value}${alphaHex}`;
  if (/^#([0-9a-fA-F]{3})$/.test(value)) {
    const [r, g, b] = value.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
  }
  return '#e2e8f0';
}

function ConversationTagChips({ tags, maxVisible = 2 }: { tags?: ConversationListItem['tags']; maxVisible?: number }) {
  const resolved = (tags ?? []).filter((tag) => tag && !tag.isArchived && tag.text?.trim());
  if (!resolved.length) return null;
  const visible = resolved.slice(0, maxVisible);
  const hiddenCount = resolved.length - visible.length;

  return (
    <View style={styles.tagRow}>
      {visible.map((tag) => {
        const color = tag.color?.trim() || '#64748b';
        return (
          <View
            key={tag.id}
            style={[styles.tagChip, { backgroundColor: hexWithAlpha(color), borderColor: hexWithAlpha(color, '33') }]}
          >
            <View style={[styles.tagChipDot, { backgroundColor: color }]} />
            <Text style={[styles.tagChipText, { color }]} numberOfLines={1}>{tag.text}</Text>
          </View>
        );
      })}
      {hiddenCount > 0 ? (
        <View style={styles.tagMoreChip}>
          <Text style={styles.tagMoreText}>+{hiddenCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

function InteractionDirectionIndicator({ direction }: { direction: 'INBOUND' | 'OUTBOUND' | null }) {
  if (!direction) return null;
  const inbound = direction === 'INBOUND';
  return inbound
    ? <ArrowDownLeft color="#f59e0b" size={14} strokeWidth={3} />
    : <ArrowUpRight color="#3b82f6" size={14} strokeWidth={3} />;
}

function ConversationPreviewContent({
  conversation,
}: {
  conversation: ConversationListItem;
}) {
  const presentation = getConversationLastInteractionPresentation(conversation);
  const preview = presentation?.preview ?? 'No messages yet';
  const messageType = (presentation?.message?.type ?? '').toUpperCase();
  const callChip = presentation?.kind === 'call' ? getCallPreviewChipConfig(preview) : null;
  const showImage = messageType === 'IMAGE' || isImagePreview(preview);
  const showVideo = messageType === 'VIDEO' || isVideoPreview(preview);
  const showVoice = messageType === 'VOICE' || isVoiceNotePreview(preview);
  const showAudio = messageType === 'AUDIO' || isAudioPreview(preview);

  if (callChip) {
    const Icon =
      callChip.tone === 'missed' ? PhoneMissed
        : callChip.tone === 'declined' ? PhoneOff
          : callChip.tone === 'incoming' ? PhoneIncoming
            : PhoneCall;
    return (
      <View style={[styles.callPreviewChip, { backgroundColor: callChip.backgroundColor }]}>
        <Icon color={callChip.textColor} size={12} />
        <Text style={[styles.callPreviewChipText, { color: callChip.textColor }]} numberOfLines={1}>{callChip.label}</Text>
      </View>
    );
  }

  if (showImage) {
    return (
      <View style={styles.mediaPreview}>
        <ImageIcon color="#64748b" size={14} />
        <Text style={styles.preview} numberOfLines={1}>Photo</Text>
      </View>
    );
  }
  if (showVideo) {
    return (
      <View style={styles.mediaPreview}>
        <Video color="#64748b" size={14} />
        <Text style={styles.preview} numberOfLines={1}>Video</Text>
      </View>
    );
  }
  if (showVoice) {
    return (
      <View style={styles.mediaPreview}>
        <Mic color="#64748b" size={14} />
        <Text style={styles.preview} numberOfLines={1}>Voice note</Text>
      </View>
    );
  }
  if (showAudio) {
    return (
      <View style={styles.mediaPreview}>
        <Mic color="#64748b" size={14} />
        <Text style={styles.preview} numberOfLines={1}>Audio</Text>
      </View>
    );
  }

  return <Text style={styles.preview} numberOfLines={1}>{preview}</Text>;
}

function ConversationRow({ conversation, onPress }: { conversation: ConversationListItem; onPress: () => void }) {
  const presentation = getConversationLastInteractionPresentation(conversation);
  const direction = presentation?.direction ?? null;
  const previewTimestamp = presentation?.timestamp ?? conversation.lastMessageAt;
  const hasUnread = conversation.unreadCount > 0;
  const isWhatsAppCustomerWindow = conversation.channel?.channelType === 'WHATSAPP' && conversation.messaging?.policyType === 'CUSTOMER_WINDOW';
  const showWindowDot = isWhatsAppCustomerWindow && conversation.messaging?.windowState !== 'NOT_APPLICABLE';
  const windowExpired = conversation.messaging?.windowState === 'EXPIRED';
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarUrl = conversation.contact.avatarUrl;
  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);
  return (
    <Pressable onPress={onPress} style={styles.rowPressable}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          {avatarUrl && !avatarFailed ? (
            <AuthenticatedImage
              url={avatarUrl}
              resizeMode="cover"
              style={styles.avatarImage}
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <Text style={styles.avatarText}>{(conversation.contact.displayName ?? '?').slice(0, 1).toUpperCase()}</Text>
          )}
          {conversation.channel?.channelType ? <View style={styles.channelBadgeWrap}><ChannelLogo type={conversation.channel.channelType} box={22} glyph={13} radius={11} /></View> : null}
        </View>
        <View style={styles.copy}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, hasUnread && styles.nameUnread]} numberOfLines={1}>{conversation.contact.displayName ?? 'Unknown contact'}</Text>
            {showWindowDot ? <WindowPulseDot expired={windowExpired} /> : null}
          </View>
          <Text style={styles.channel} numberOfLines={1}>{conversation.channel?.channelName ?? ''}</Text>
          <View style={styles.previewRow}>
            <InteractionDirectionIndicator direction={direction} />
            <View style={styles.previewContent}>
              <ConversationPreviewContent conversation={conversation} />
            </View>
          </View>
          <ConversationTagChips tags={conversation.tags} />
        </View>
        <View style={styles.side}>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>{formatTime(previewTimestamp)}</Text>
          <View style={styles.sideMiddle}>
            {hasUnread ? (
              <View style={styles.unreadBadge}><Text style={styles.unreadText}>{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</Text></View>
            ) : null}
          </View>
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
  listFill: { flex: 1, minHeight: 0 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, paddingHorizontal: 16 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitleLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  headerTitle: { color: '#111827', fontSize: 24, fontWeight: '800' },
  headerSubtitle: { color: '#8ba2c3', fontSize: 12, marginTop: 4 },
  statusDot: { borderRadius: 5, height: 9, width: 9 },
  sidebarTabs: { borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', gap: 20, paddingHorizontal: 16, paddingTop: 4 },
  sidebarTab: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingBottom: 10, paddingTop: 8, position: 'relative' },
  sidebarTabText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  sidebarTabTextActive: { color: '#2563eb' },
  sidebarTabCount: { backgroundColor: '#f1f5f9', borderRadius: 999, color: '#64748b', fontSize: 11, fontWeight: '700', minWidth: 20, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1, textAlign: 'center' },
  sidebarTabUnderline: { backgroundColor: '#2563eb', borderRadius: 999, bottom: 0, height: 2, left: 0, position: 'absolute', right: 0 },
  search: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 25, flexDirection: 'row', margin: 12, paddingHorizontal: 14 },
  input: { color: '#17233a', flex: 1, height: 42, marginLeft: 8 },
  clearSearch: { color: '#94a3b8', fontSize: 14, padding: 4 },
  filters: { backgroundColor: '#f1f5f9', borderRadius: 22, flexDirection: 'row', marginHorizontal: 12, padding: 4 },
  filterPill: { alignItems: 'center', borderRadius: 18, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 8 },
  filterPillActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  filterText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#17233a', fontWeight: '700' },
  count: { backgroundColor: '#eef4ff', borderRadius: 10, color: '#2563eb', fontSize: 11, fontWeight: '700', minWidth: 20, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2, textAlign: 'center' },
  closedBanner: { backgroundColor: '#eff6ff', borderColor: '#dbeafe', borderRadius: 14, borderWidth: 1, marginHorizontal: 12, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  closedBannerTitle: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  closedBannerBody: { color: '#64748b', fontSize: 12, marginTop: 2 },
  toolbar: { alignItems: 'center', borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  unrepliedToggle: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0, paddingRight: 8 },
  unrepliedLabel: { color: '#64748b', flexShrink: 1, fontSize: 13, fontWeight: '500' },
  filterButton: { alignItems: 'center', borderColor: '#c8dcfc', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 7, position: 'relative' },
  filterButtonText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  filterButtonActive: { borderColor: '#2563eb' },
  filterButtonActiveText: { color: '#2563eb', fontWeight: '700' },
  filterActiveDot: { backgroundColor: '#2563eb', borderRadius: 4, height: 8, position: 'absolute', right: -2, top: -2, width: 8 },
  filterOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', padding: 20 },
  filterSheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  filterSheetTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  filterLayerTabs: { backgroundColor: '#f1f5f9', borderRadius: 14, flexDirection: 'row', gap: 4, marginBottom: 12, padding: 4 },
  filterLayerTab: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 8 },
  filterLayerTabActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  filterLayerTabText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  filterLayerTabTextActive: { color: '#0f172a', fontWeight: '700' },
  filterLayerBody: { maxHeight: 360 },
  filterLayerContent: { paddingBottom: 8 },
  inlineSearch: { alignItems: 'center', backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginBottom: 10, paddingHorizontal: 10 },
  inlineSearchInput: { color: '#17233a', flex: 1, height: 40, marginLeft: 8 },
  selectedCount: { color: '#64748b', fontSize: 12, marginBottom: 8 },
  optionList: { gap: 6 },
  optionRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 10 },
  optionRowActive: { backgroundColor: '#dbeafe' },
  optionRowText: { color: '#334155', flex: 1, fontSize: 14, fontWeight: '500' },
  optionRowTextActive: { color: '#1d4ed8', fontWeight: '700' },
  tagDot: { borderRadius: 5, height: 10, width: 10 },
  emptyFilterHint: { color: '#94a3b8', fontSize: 13, paddingVertical: 12 },
  sectionLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderColor: '#c8dcfc', borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  channelChip: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: '#eef4ff', borderColor: '#2563eb' },
  chipText: { color: '#526987', fontSize: 13 },
  chipTextActive: { color: '#2563eb', fontWeight: '700' },
  assignmentSegment: { backgroundColor: '#f1f5f9', borderRadius: 20, flexDirection: 'row', marginBottom: 14, padding: 4 },
  assignmentOption: { alignItems: 'center', borderRadius: 16, flex: 1, paddingVertical: 8 },
  assignmentOptionActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  assignmentOptionText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  assignmentOptionTextActive: { color: '#0f172a', fontWeight: '700' },
  switchRow: { alignItems: 'center', borderColor: '#dbeafe', borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10 },
  switchRowCopy: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  switchRowLabel: { color: '#334155', fontSize: 14, fontWeight: '600' },
  filterReset: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  filterResetDisabled: { opacity: 0.45 },
  filterResetText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  filterResetTextDisabled: { color: '#94a3b8' },
  filterApply: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, marginTop: 10, paddingVertical: 14 },
  filterApplyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptyClearButton: { backgroundColor: '#eff6ff', borderRadius: 12, marginTop: 14, paddingHorizontal: 14, paddingVertical: 10 },
  emptyClearButtonText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  rowPressable: { backgroundColor: '#fff' },
  row: { backgroundColor: '#fff', borderBottomColor: '#eef2f7', borderBottomWidth: 1, flexDirection: 'row', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 12 },
  avatar: { alignItems: 'center', backgroundColor: '#f9c43d', borderRadius: 24, height: 48, justifyContent: 'center', overflow: 'visible', position: 'relative', width: 48 },
  avatarImage: { borderRadius: 24, height: 48, width: 48 },
  avatarText: { color: '#111827', fontSize: 18, fontWeight: '700' },
  channelBadgeWrap: { alignItems: 'center', borderColor: '#fff', borderRadius: 11, borderWidth: 2, bottom: -2, height: 22, justifyContent: 'center', overflow: 'hidden', position: 'absolute', right: -2, width: 22 },
  copy: { flex: 1, marginLeft: 12, minWidth: 0 },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  name: { color: '#111827', flexShrink: 1, fontSize: 15, fontWeight: '600' },
  nameUnread: { fontWeight: '800' },
  windowDotWrap: { alignItems: 'center', height: 12, justifyContent: 'center', width: 12 },
  windowDotRing: { borderRadius: 6, height: 12, position: 'absolute', width: 12 },
  windowDot: { borderRadius: 4, elevation: 3, height: 8, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 5, width: 8 },
  unreadBadge: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, justifyContent: 'center', minWidth: 20, paddingHorizontal: 5 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  time: { color: '#8ba2c3', fontSize: 11 },
  timeUnread: { color: '#315efb', fontWeight: '700' },
  channel: { color: '#94a3b8', fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  previewRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 6, minWidth: 0 },
  previewContent: { flex: 1, minWidth: 0 },
  preview: { color: '#64748b', fontSize: 13 },
  mediaPreview: { alignItems: 'center', flexDirection: 'row', gap: 5, minWidth: 0 },
  callPreviewChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  callPreviewChipText: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
  tagRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'nowrap', gap: 6, marginTop: 6, overflow: 'hidden' },
  tagChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 1,
    gap: 5,
    maxWidth: '70%',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagChipDot: { borderRadius: 3, height: 6, width: 6 },
  tagChipText: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
  tagMoreChip: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagMoreText: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  side: { alignItems: 'flex-end', alignSelf: 'stretch', justifyContent: 'space-between', marginLeft: 12, minWidth: 44 },
  sideMiddle: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', minHeight: 20 },
  assigneeBadge: { alignItems: 'center', backgroundColor: '#fef3c7', borderColor: '#fff', borderRadius: 10, borderWidth: 2, flexShrink: 0, height: 20, justifyContent: 'center', marginTop: 4, overflow: 'hidden', width: 20 },
  assigneeImage: { height: 20, width: 20 },
  assigneeInitials: { color: '#92400e', fontSize: 9, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { color: '#64748b', fontSize: 15, fontWeight: '700', marginTop: 12 },
  emptyBody: { color: '#94a3b8', fontSize: 13, marginTop: 4, textAlign: 'center' },
  loader: { marginTop: 40 },
});
