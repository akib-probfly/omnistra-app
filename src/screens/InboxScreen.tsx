import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Filter, Image as ImageIcon, Inbox, Mail, MessageSquareText, Mic, Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, Search, Star, Video } from 'lucide-react-native';
import { Animated, Easing, FlatList, Pressable, StyleSheet, Text, TextInput, View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppToggle } from '../components/AppToggle';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { ColorfulAvatar } from '../components/ColorfulAvatar';
import { ErrorState } from '../components/ErrorState';
import { ChannelLogo, channelBrandColor } from '../components/ChannelLogo';
import { InboxCallsPane } from '../components/InboxCallsPane';
import { ListSkeleton, PanelSkeleton } from '../components/Skeleton';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import { useTheme } from '../theme/ThemeContext';

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
  const { colors } = useTheme();
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

  const realtimeStatus = useSyncExternalStore(subscribeRealtimeConnectionStatus, getRealtimeConnectionStatus);
  // Realtime should drive updates; keep a slow poll even when "connected" because mobile
  // sockets can go zombie (no disconnect event) and then stop delivering events.
  const inboxPollMs = realtimeStatus === 'connected' ? 60_000 : 20_000;

  const conversations = useInfiniteQuery({
    queryKey: ['conversations', filters],
    queryFn: async ({ pageParam }) => {
      const result = await fetchConversations({ ...filters, limit: 25, cursor: pageParam });
      return { ...result, items: applyUnreadOverrideToPage(result.items) };
    },
    enabled: sidebarTab === 'chats',
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pageInfo?.hasMore ? (lastPage.pageInfo.nextCursor ?? undefined) : undefined,
    staleTime: 15_000,
    refetchInterval: inboxPollMs,
    refetchOnWindowFocus: false,
  });

  const unreadCount = useQuery({
    queryKey: ['inbox-unread-count', advancedFilterParams],
    queryFn: () => fetchConversationUnreadCount(advancedFilterParams),
    staleTime: 15_000,
    refetchInterval: inboxPollMs,
    refetchOnWindowFocus: false,
  });

  const closedCount = useQuery({
    queryKey: ['conversation-count', { ...filters, status: 'CLOSED' as const }],
    queryFn: () => fetchConversationCount({ ...filters, status: 'CLOSED' }),
    enabled: sidebarTab === 'chats' && tab === 'closed',
    staleTime: 15_000,
    refetchInterval: inboxPollMs,
    refetchOnWindowFocus: false,
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
  const unreadConversationCountFromList = useMemo(
    () => items.reduce((count, item) => count + (item.unreadCount > 0 ? 1 : 0), 0),
    [items],
  );
  const apiUnreadConversationCount = typeof unreadCount.data === 'number'
    ? unreadCount.data
    : Math.max(0, Number((unreadCount.data as { count?: number } | undefined)?.count ?? 0) || 0);
  // Badge can lag behind optimistic row unread; never show less than what's visible in the list.
  const chatsUnreadCount = Math.max(apiUnreadConversationCount, unreadConversationCountFromList);
  const listExtraData = useMemo(
    () => items.map((item) => {
      const at = item.lastInteraction?.at ?? item.lastMessageAt ?? '';
      const previewId = item.lastInteraction?.kind === 'MESSAGE' ? item.lastInteraction.message.id : '';
      return `${item.id}:${item.unreadCount}:${at}:${previewId}`;
    }).join('|'),
    [items],
  );

  const keyExtractor = useCallback((item: ConversationListItem) => item.id, []);
  const renderConversationRow = useCallback(
    ({ item }: { item: ConversationListItem }) => <ConversationRow conversation={item} navigation={navigation} />,
    [navigation],
  );

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (tagTextTimer.current) clearTimeout(tagTextTimer.current);
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, flex: 1 }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.headerTitleLine}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox</Text>
        </View>
        <View style={styles.sidebarTabs}>
          <Pressable style={styles.sidebarTab} onPress={() => setSidebarTab('chats')}>
            <MessageSquareText color={sidebarTab === 'chats' ? colors.primary : colors.textMuted} size={15} />
            <Text style={[styles.sidebarTabText, { color: sidebarTab === 'chats' ? colors.primary : colors.textMuted }]}>Chats</Text>
            {chatsUnreadCount > 0 ? (
              <Text style={[styles.sidebarTabCount, { backgroundColor: colors.primary, color: '#fff' }]}>
                {chatsUnreadCount > 99 ? '99+' : chatsUnreadCount}
              </Text>
            ) : null}
            {sidebarTab === 'chats' ? <View style={[styles.sidebarTabUnderline, { backgroundColor: colors.primary }]} /> : null}
          </Pressable>
          <Pressable style={styles.sidebarTab} onPress={() => setSidebarTab('calls')}>
            <Phone color={sidebarTab === 'calls' ? colors.primary : colors.textMuted} size={15} />
            <Text style={[styles.sidebarTabText, { color: sidebarTab === 'calls' ? colors.primary : colors.textMuted }]}>Calls</Text>
            {sidebarTab === 'calls' ? <View style={[styles.sidebarTabUnderline, { backgroundColor: colors.primary }]} /> : null}
          </Pressable>
        </View>
      </View>

      {sidebarTab === 'calls' ? (
        <InboxCallsPane onOpenConversation={openCallConversation} />
      ) : (
        <>
          <View style={[styles.searchRow, { borderBottomColor: colors.separator }]}>
            <View style={[styles.search, { backgroundColor: colors.surfaceSecondary }]}>
              <Search color={colors.textMuted} size={16} />
              <TextInput value={search} onChangeText={onSearchChange} placeholder="Search..." placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} />
              {debouncedSearch ? <Pressable onPress={() => { setSearch(''); setDebouncedSearch(''); }}><Text style={[styles.clearSearch, { color: colors.textMuted }]}>✕</Text></Pressable> : null}
            </View>
            <Pressable style={[styles.filterButton, { borderColor: hasAdvancedFilters ? colors.primary : colors.cardBorder }]} onPress={() => setFilterOpen(true)}>
              <Filter color={hasAdvancedFilters ? colors.primary : colors.textSecondary} size={15} />
              {hasAdvancedFilters ? <View style={[styles.filterActiveDot, { backgroundColor: colors.primary }]} /> : null}
            </Pressable>
          </View>

          <View style={[styles.filtersRow, { borderBottomColor: colors.separator }]}>
            <View style={[styles.filters, { backgroundColor: colors.surfaceSecondary }]}>
              {(['all', 'unread', 'closed'] as Tab[]).map((key) => {
                const active = tab === key;
                return (
                  <Pressable key={key} style={[styles.filterPill, active && styles.filterPillActive, active && { backgroundColor: colors.surface }]} onPress={() => setTab(key)}>
                    <Text style={[styles.filterText, { color: active ? colors.text : colors.textSecondary }]}>{key === 'all' ? 'All' : key === 'unread' ? 'Unread' : 'Closed'}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.unrepliedToggle, { borderColor: colors.cardBorder }, unrepliedOnly && styles.unrepliedToggleActive, unrepliedOnly && { backgroundColor: colors.surfaceSecondary, borderColor: colors.primary }]}
              onPress={() => setUnrepliedOnly((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: unrepliedOnly }}
              accessibilityLabel="Unreplied only"
            >
              <AppToggle value={unrepliedOnly} variant="sidebar" />
              <Text style={[styles.unrepliedLabel, { color: unrepliedOnly ? colors.primary : colors.textSecondary }]}>Unreplied</Text>
            </Pressable>
          </View>

          {tab === 'closed' ? (
            <View style={[styles.closedBanner, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
              <Text style={[styles.closedBannerTitle, { color: colors.text }]}>
                {closedCount.isLoading ? 'Loading closed count...' : `${new Intl.NumberFormat().format(closedCount.data ?? 0)} closed`}
              </Text>
            </View>
          ) : null}

          {conversations.isLoading ? <ListSkeleton rows={8} />
          : conversations.isError ? <ErrorState message="Unable to load conversations." onRetry={() => conversations.refetch()} />
          : (
            <FlatList
              style={styles.listFill}
              data={items}
              keyExtractor={keyExtractor}
              renderItem={renderConversationRow}
              extraData={listExtraData}
              ListEmptyComponent={(
                <View style={styles.empty}>
                  <Inbox color={colors.textMuted} size={44} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No conversations</Text>
                  <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                    {canClearFilters || debouncedSearch.trim()
                      ? 'No conversations match the current filters.'
                      : 'New conversations will appear here in real time.'}
                  </Text>
                  {canClearFilters || debouncedSearch.trim() ? (
                    <Pressable
                      style={[styles.emptyClearButton, { backgroundColor: colors.surfaceSecondary }]}
                      onPress={() => {
                        resetFilters();
                        setSearch('');
                        setDebouncedSearch('');
                      }}
                    >
                      <Text style={[styles.emptyClearButtonText, { color: colors.primary }]}>Clear filters</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
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

      <BottomSheet visible={filterOpen && sidebarTab === 'chats'} onClose={() => setFilterOpen(false)} sheetStyle={styles.filterSheetSurface}>
          <View style={styles.filterSheetHeader}>
              <Text style={[styles.filterSheetTitle, { color: colors.text }]}>Filters</Text>
            </View>

            <View style={[styles.filterLayerTabs, { backgroundColor: colors.surfaceSecondary }]}>
              {FILTER_LAYERS.map((layer) => {
                const active = filterLayer === layer.id;
                return (
                  <Pressable key={layer.id} style={[styles.filterLayerTab, active && styles.filterLayerTabActive, active && { backgroundColor: colors.surface }]} onPress={() => setFilterLayer(layer.id)}>
                    <Text style={[styles.filterLayerTabText, { color: active ? colors.text : colors.textSecondary }]}>{layer.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <SheetScrollView style={styles.filterLayerBody} contentContainerStyle={styles.filterLayerContent} keyboardShouldPersistTaps="handled">
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
                  <View style={[styles.inlineSearch, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                    <Search color={colors.textMuted} size={16} />
                    <TextInput
                      value={tagTextInput}
                      onChangeText={onTagTextChange}
                      placeholder="Search tags..."
                      placeholderTextColor={colors.textMuted}
                      style={[styles.inlineSearchInput, { color: colors.text }]}
                    />
                  </View>
                  <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>{selectedTagIds.length} selected</Text>
                  {tagsQuery.isLoading ? <PanelSkeleton rows={4} /> : (
                    <View style={styles.optionList}>
                      {visibleTagOptions.map((tag) => {
                        const active = selectedTagIds.includes(tag.id);
                        return (
                          <Pressable
                            key={tag.id}
                            style={[styles.optionRow, active && styles.optionRowActive, active && { backgroundColor: colors.primary }]}
                            onPress={() => setSelectedTagIds((current) => active ? current.filter((id) => id !== tag.id) : [...current, tag.id])}
                          >
                            <View style={[styles.tagDot, { backgroundColor: tag.color || colors.textMuted }]} />
                            <Text style={[styles.optionRowText, { color: active ? '#fff' : colors.textSecondary }, active && styles.optionRowTextActive]} numberOfLines={1}>{tag.text}</Text>
                          </Pressable>
                        );
                      })}
                      {!visibleTagOptions.length ? <Text style={[styles.emptyFilterHint, { color: colors.textMuted }]}>No tags match the current search</Text> : null}
                    </View>
                  )}
                </>
              ) : null}

              {filterLayer === 'users' ? (
                <>
                  <View style={[styles.inlineSearch, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                    <Search color={colors.textMuted} size={16} />
                    <TextInput
                      value={userSearchInput}
                      onChangeText={setUserSearchInput}
                      placeholder="Search assignees..."
                      placeholderTextColor={colors.textMuted}
                      style={[styles.inlineSearchInput, { color: colors.text }]}
                    />
                  </View>
                  {assigneesQuery.isLoading ? <PanelSkeleton rows={4} /> : assigneesQuery.isError ? (
                    <Text style={[styles.emptyFilterHint, { color: colors.textMuted }]}>Could not load assignee options.</Text>
                  ) : (
                    <View style={styles.optionList}>
                      {visibleAssigneeOptions.map((member) => {
                        const active = assigneeIds.includes(member.workspaceMemberId);
                        return (
                          <Pressable
                            key={member.workspaceMemberId}
                            style={[styles.optionRow, active && styles.optionRowActive, active && { backgroundColor: colors.primary }]}
                            onPress={() => setAssigneeIds((current) => active ? current.filter((id) => id !== member.workspaceMemberId) : [...current, member.workspaceMemberId])}
                          >
                            <Text style={[styles.optionRowText, { color: active ? '#fff' : colors.textSecondary }, active && styles.optionRowTextActive]} numberOfLines={1}>{member.name ?? member.email}</Text>
                          </Pressable>
                        );
                      })}
                      {!visibleAssigneeOptions.length ? <Text style={[styles.emptyFilterHint, { color: colors.textMuted }]}>No assignee options match the current search</Text> : null}
                    </View>
                  )}
                </>
              ) : null}

              {filterLayer === 'more' ? (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Assignment</Text>
                  <View style={[styles.assignmentSegment, { backgroundColor: colors.surfaceSecondary }]}>
                    {([['any', 'Any'], ['assigned', 'Assigned'], ['unassigned', 'Unassigned']] as const).map(([value, label]) => (
                      <Pressable key={value} style={[styles.assignmentOption, assignment === value && styles.assignmentOptionActive, assignment === value && { backgroundColor: colors.surface }]} onPress={() => setAssignment(value)}>
                        <Text style={[styles.assignmentOptionText, { color: assignment === value ? colors.text : colors.textSecondary }]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Pressable
                    style={[styles.switchRow, { borderColor: colors.cardBorder }]}
                    onPress={() => setStarredOnly((value) => !value)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: starredOnly }}
                    accessibilityLabel="Starred only"
                  >
                    <View style={styles.switchRowCopy}>
                      <Star color="#f59e0b" size={16} fill={starredOnly ? '#f59e0b' : 'none'} />
                      <Text style={[styles.switchRowLabel, { color: colors.textSecondary }]}>Starred only</Text>
                    </View>
                    <AppToggle value={starredOnly} tone="amber" />
                  </Pressable>

                  <Pressable
                    style={[styles.switchRow, { borderColor: colors.cardBorder }]}
                    onPress={() => setUnrepliedOnly((value) => !value)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: unrepliedOnly }}
                    accessibilityLabel="Unreplied only"
                  >
                    <View style={styles.switchRowCopy}>
                      <Mail color={colors.primary} size={16} />
                      <Text style={[styles.switchRowLabel, { color: colors.textSecondary }]}>Unreplied only</Text>
                    </View>
                    <AppToggle value={unrepliedOnly} tone="blue" />
                  </Pressable>
                </>
              ) : null}
            </SheetScrollView>

            <Pressable style={[styles.filterReset, !canClearFilters && styles.filterResetDisabled]} onPress={resetFilters} disabled={!canClearFilters}>
              <Text style={[styles.filterResetText, { color: canClearFilters ? colors.error : colors.textMuted }]}>Clear all</Text>
            </Pressable>
            <Pressable style={[styles.filterApply, { backgroundColor: colors.primary }]} onPress={() => setFilterOpen(false)}>
              <Text style={styles.filterApplyText}>Apply filters</Text>
            </Pressable>
        </BottomSheet>
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
      <ColorfulAvatar name={label} size={20} url={assignee.avatarUrl} />
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
  const { colors } = useTheme();
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
        <View style={[styles.tagMoreChip, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
          <Text style={[styles.tagMoreText, { color: colors.textSecondary }]}>+{hiddenCount}</Text>
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
  const { colors } = useTheme();
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
        <ImageIcon color={colors.textSecondary} size={14} />
        <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>Photo</Text>
      </View>
    );
  }
  if (showVideo) {
    return (
      <View style={styles.mediaPreview}>
        <Video color={colors.textSecondary} size={14} />
        <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>Video</Text>
      </View>
    );
  }
  if (showVoice) {
    return (
      <View style={styles.mediaPreview}>
        <Mic color={colors.textSecondary} size={14} />
        <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>Voice note</Text>
      </View>
    );
  }
  if (showAudio) {
    return (
      <View style={styles.mediaPreview}>
        <Mic color={colors.textSecondary} size={14} />
        <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>Audio</Text>
      </View>
    );
  }

  return <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>{preview}</Text>;
}

const ConversationRow = memo(function ConversationRow({ conversation, navigation }: { conversation: ConversationListItem; navigation: any }) {
  const { colors } = useTheme();
  const presentation = getConversationLastInteractionPresentation(conversation);
  const direction = presentation?.direction ?? null;
  const previewTimestamp = presentation?.timestamp ?? conversation.lastMessageAt;
  const hasUnread = conversation.unreadCount > 0;
  const isWhatsAppCustomerWindow = conversation.channel?.channelType === 'WHATSAPP' && conversation.messaging?.policyType === 'CUSTOMER_WINDOW';
  const showWindowDot = isWhatsAppCustomerWindow && conversation.messaging?.windowState !== 'NOT_APPLICABLE';
  const windowExpired = conversation.messaging?.windowState === 'EXPIRED';
  const onPress = useCallback(() => {
    navigation.navigate('Conversation', {
      conversationId: conversation.id,
      contactName: conversation.contact.displayName ?? 'Unknown contact',
      workspaceId: conversation.workspaceId,
      channelId: conversation.channel?.channelId,
      channelType: conversation.channel?.channelType,
    });
  }, [navigation, conversation]);
  return (
    <Pressable onPress={onPress} style={[styles.rowPressable, { backgroundColor: colors.surface }]}>
      <View style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.separator }]}>
        <View style={styles.avatar}>
          <ColorfulAvatar
            name={conversation.contact.displayName ?? 'Unknown contact'}
            size={48}
            url={conversation.contact.avatarUrl}
          />
          {conversation.channel?.channelType ? <View style={[styles.channelBadgeWrap, { borderColor: colors.surface }]}><ChannelLogo type={conversation.channel.channelType} box={22} glyph={13} radius={11} /></View> : null}
        </View>
        <View style={styles.copy}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, { color: colors.text }, hasUnread && styles.nameUnread]} numberOfLines={1}>{conversation.contact.displayName ?? 'Unknown contact'}</Text>
            {showWindowDot ? <WindowPulseDot expired={windowExpired} /> : null}
          </View>
          <Text style={[styles.channel, { color: colors.textMuted }]} numberOfLines={1}>{conversation.channel?.channelName ?? ''}</Text>
          <View style={styles.previewRow}>
            <InteractionDirectionIndicator direction={direction} />
            <View style={styles.previewContent}>
              <ConversationPreviewContent conversation={conversation} />
            </View>
          </View>
          <ConversationTagChips tags={conversation.tags} />
        </View>
        <View style={styles.side}>
          <Text style={[styles.time, { color: hasUnread ? colors.primary : colors.textMuted }, hasUnread && styles.timeUnread]}>{formatTime(previewTimestamp)}</Text>
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
});

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
  header: {
    alignItems: 'flex-end',
    backgroundColor: '#fff',
    borderBottomColor: '#e8eef7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 0,
    paddingHorizontal: 14,
  },
  headerTitleLine: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingBottom: 10 },
  headerTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  sidebarTabs: { flexDirection: 'row', gap: 14 },
  sidebarTab: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingBottom: 10, paddingTop: 2, position: 'relative' },
  sidebarTabText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  sidebarTabTextActive: { color: '#2563eb' },
  sidebarTabCount: { backgroundColor: '#f1f5f9', borderRadius: 999, color: '#64748b', fontSize: 10, fontWeight: '700', minWidth: 18, overflow: 'hidden', paddingHorizontal: 5, paddingVertical: 1, textAlign: 'center' },
  sidebarTabUnderline: { backgroundColor: '#2563eb', borderRadius: 999, bottom: 0, height: 2, left: 0, position: 'absolute', right: 0 },
  searchRow: { alignItems: 'center', borderBottomColor: '#eef2f7', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, paddingBottom: 8, paddingHorizontal: 12, paddingTop: 8 },
  search: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 18, flex: 1, flexDirection: 'row', minWidth: 0, paddingHorizontal: 12 },
  input: { color: '#17233a', flex: 1, height: 36, marginLeft: 6, paddingVertical: 0 },
  clearSearch: { color: '#94a3b8', fontSize: 14, padding: 4 },
  filtersRow: { alignItems: 'center', borderBottomColor: '#e2e8f0', borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingBottom: 8, paddingHorizontal: 12, paddingTop: 8 },
  filters: { backgroundColor: '#f1f5f9', borderRadius: 18, flex: 1, flexDirection: 'row', minWidth: 0, padding: 3 },
  filterPill: { alignItems: 'center', borderRadius: 15, flex: 1, justifyContent: 'center', paddingVertical: 6 },
  filterPillActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  filterText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#17233a', fontWeight: '700' },
  count: { backgroundColor: '#eef4ff', borderRadius: 10, color: '#2563eb', fontSize: 11, fontWeight: '700', minWidth: 20, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2, textAlign: 'center' },
  closedBanner: { backgroundColor: '#eff6ff', borderColor: '#dbeafe', borderRadius: 10, borderWidth: 1, marginHorizontal: 12, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6 },
  closedBannerTitle: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  unrepliedToggle: { alignItems: 'center', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, flexDirection: 'row', flexShrink: 0, gap: 6, paddingHorizontal: 8, paddingVertical: 5 },
  unrepliedToggleActive: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  unrepliedLabel: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  unrepliedLabelActive: { color: '#2563eb' },
  filterButton: { alignItems: 'center', borderColor: '#c8dcfc', borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', position: 'relative', width: 36 },
  filterButtonActive: { borderColor: '#2563eb' },
  filterActiveDot: { backgroundColor: '#2563eb', borderRadius: 4, height: 8, position: 'absolute', right: -2, top: -2, width: 8 },
  filterOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  filterSheetSurface: { paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
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
  avatar: { alignItems: 'center', backgroundColor: 'transparent', borderRadius: 24, height: 48, justifyContent: 'center', overflow: 'visible', position: 'relative', width: 48 },
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
