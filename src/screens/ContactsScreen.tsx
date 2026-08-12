import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ContactRound, Filter, Mail, Phone, Plus, Search, X } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../api/client';
import {
  createCrmContact,
  fetchCrmContacts,
  formatPhoneNumberDisplay,
  getContactTitle,
  type CrmContactListItem,
} from '../api/contacts';
import { fetchAssigneeOptions } from '../api/inbox';
import { fetchWorkspaceTags } from '../api/conversationDetails';
import { AppToggle } from '../components/AppToggle';
import { BottomSheet } from '../components/BottomSheet';
import { InlineSkeleton, ListSkeleton } from '../components/Skeleton';
import { ChannelLogo } from '../components/ChannelLogo';
import { ColorfulAvatar } from '../components/ColorfulAvatar';
import { ErrorState } from '../components/ErrorState';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';
import { useTheme } from '../theme/ThemeContext';
import type { ContactsStackParamList } from '../navigation/ContactsStack';

type FilterLayer = 'channels' | 'labels' | 'users' | 'more';
type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

type ChannelOption = {
  id: string;
  channelName?: string | null;
  name?: string | null;
  type?: string;
  channelType?: string;
  accounts?: Array<{
    id: string;
    isEnabled?: boolean;
    displayPhoneNumber?: string | null;
    externalAccountId?: string | null;
  }>;
};

type WhatsappAccountOption = {
  accountId: string;
  channelName: string;
  displayPhoneNumber: string | null;
  channelType: string;
};

const FILTER_LAYERS: Array<{ id: FilterLayer; label: string }> = [
  { id: 'channels', label: 'Channels' },
  { id: 'labels', label: 'Labels' },
  { id: 'users', label: 'Users' },
  { id: 'more', label: 'More' },
];

function getInitials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}

function formatRelativeActivity(value: string | null) {
  if (!value) return 'No activity';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'No activity';
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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

export function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ContactsStackParamList>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [filterLayer, setFilterLayer] = useState<FilterLayer>('channels');
  const [assignment, setAssignment] = useState<AssignmentFilter>('all');
  const [recentlyActive, setRecentlyActive] = useState(false);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addChannelAccountId, setAddChannelAccountId] = useState<string | null>(null);
  const [addTags, setAddTags] = useState<string[]>([]);
  const [addChannelSearch, setAddChannelSearch] = useState('');
  const [addTagSearch, setAddTagSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 400);
  };

  const filters = useMemo(() => ({
    search: debouncedSearch.trim() || undefined,
    channelIds: channelIds.length ? channelIds : undefined,
    tagIds: tagIds.length ? tagIds : undefined,
    ownerWorkspaceMemberIds: ownerId ? [ownerId] : undefined,
    assigned: assignment === 'assigned' ? true : undefined,
    unassigned: assignment === 'unassigned' ? true : undefined,
    recentlyActive: recentlyActive || undefined,
  }), [debouncedSearch, channelIds, tagIds, ownerId, assignment, recentlyActive]);

  const hasAdvancedFilters = channelIds.length > 0 || tagIds.length > 0 || ownerId != null || assignment !== 'all' || recentlyActive;

  const contactsQuery = useInfiniteQuery({
    queryKey: ['crm-contacts', filters],
    queryFn: ({ pageParam }) => fetchCrmContacts({ ...filters, limit: 20, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.pageInfo?.hasMore ? (lastPage.pageInfo.nextCursor ?? undefined) : undefined),
    staleTime: 20_000,
  });

  const channelsQuery = useQuery({
    queryKey: ['channels', 'contacts-filter'],
    queryFn: () => apiFetch<{ items: ChannelOption[] }>('/channels?page=1&limit=100&sortBy=createdAt&sortOrder=desc'),
    enabled: filterOpen || addOpen,
    staleTime: 60_000,
  });

  const assigneesQuery = useQuery({
    queryKey: ['assignee-filter-options', 'contacts'],
    queryFn: () => fetchAssigneeOptions(),
    enabled: filterOpen,
    staleTime: 60_000,
  });

  const tagsQuery = useQuery({
    queryKey: ['workspace-tags', 'contacts'],
    queryFn: () => fetchWorkspaceTags(),
    enabled: filterOpen || addOpen,
    staleTime: 60_000,
  });

  const items = useMemo(() => (contactsQuery.data?.pages ?? []).flatMap((page) => page.items), [contactsQuery.data]);
  const renderContactRow = useCallback(
    ({ item }: { item: CrmContactListItem }) => <ContactRow contact={item} navigation={navigation} />,
    [navigation],
  );
  const totalCount = contactsQuery.data?.pages?.[0]?.totalCount ?? items.length;
  const channelOptions = channelsQuery.data?.items ?? [];
  const whatsappAccountOptions = useMemo(() => {
    const options: WhatsappAccountOption[] = [];
    for (const channel of channelOptions) {
      const type = (channel.type ?? channel.channelType ?? '').toUpperCase();
      if (type !== 'WHATSAPP') continue;
      const account = channel.accounts?.find((item) => item.isEnabled) ?? channel.accounts?.[0];
      if (!account?.id) continue;
      options.push({
        accountId: account.id,
        channelName: channel.channelName ?? channel.name ?? 'WhatsApp',
        displayPhoneNumber: account.displayPhoneNumber ?? account.externalAccountId ?? null,
        channelType: type,
      });
    }
    return options;
  }, [channelOptions]);

  const visibleAddChannels = useMemo(() => {
    const query = addChannelSearch.trim().toLowerCase();
    const filtered = !query
      ? whatsappAccountOptions
      : whatsappAccountOptions.filter((option) => (
        `${option.channelName} ${option.displayPhoneNumber ?? ''}`.toLowerCase().includes(query)
      ));
    return filtered.slice(0, 5);
  }, [whatsappAccountOptions, addChannelSearch]);

  const existingTagTexts = useMemo(
    () => (tagsQuery.data?.items ?? []).filter((tag) => !tag.isArchived).map((tag) => tag.text).sort((a, b) => a.localeCompare(b)),
    [tagsQuery.data?.items],
  );

  const visibleAddTags = useMemo(() => {
    const query = addTagSearch.trim().toLowerCase();
    const available = existingTagTexts.filter((tag) => !addTags.includes(tag));
    if (!query) return available.slice(0, 5);
    return available.filter((tag) => tag.toLowerCase().includes(query)).slice(0, 5);
  }, [existingTagTexts, addTags, addTagSearch]);

  const canCreateAddTag = useMemo(() => {
    const query = addTagSearch.trim();
    if (!query) return false;
    const normalized = query.toLowerCase();
    return !existingTagTexts.some((tag) => tag.toLowerCase() === normalized) && !addTags.some((tag) => tag.toLowerCase() === normalized);
  }, [addTagSearch, existingTagTexts, addTags]);

  const resolvedAddChannelIds = useMemo(() => {
    if (addChannelAccountId) return [addChannelAccountId];
    return whatsappAccountOptions[0] ? [whatsappAccountOptions[0].accountId] : [];
  }, [addChannelAccountId, whatsappAccountOptions]);

  useEffect(() => {
    if (!addOpen) return;
    if (addChannelAccountId) return;
    if (whatsappAccountOptions[0]) {
      setAddChannelAccountId(whatsappAccountOptions[0].accountId);
    }
  }, [addOpen, addChannelAccountId, whatsappAccountOptions]);

  const assigneeOptions = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    const options = assigneesQuery.data ?? [];
    if (!query) return options;
    return options.filter((member) => `${member.name ?? ''} ${member.email}`.toLowerCase().includes(query));
  }, [assigneesQuery.data, userSearch]);
  const tagOptions = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    const tags = tagsQuery.data?.items ?? [];
    if (!query) return tags;
    return tags.filter((tag) => tag.text.toLowerCase().includes(query));
  }, [tagsQuery.data?.items, tagSearch]);

  const resetFilters = () => {
    setAssignment('all');
    setRecentlyActive(false);
    setChannelIds([]);
    setTagIds([]);
    setOwnerId(null);
    setUserSearch('');
    setTagSearch('');
  };

  const resetAddForm = () => {
    setAddName('');
    setAddPhone('');
    setAddEmail('');
    setAddChannelAccountId(null);
    setAddTags([]);
    setAddChannelSearch('');
    setAddTagSearch('');
  };

  const createMutation = useMutation({
    mutationFn: () => createCrmContact({
      displayName: addName.trim(),
      primaryPhone: addPhone.trim(),
      phoneNumber: addPhone.trim(),
      primaryEmail: addEmail.trim() || null,
      source: 'manual-create',
      tags: addTags,
      channels: resolvedAddChannelIds,
    }),
    onSuccess: async (contact) => {
      setAddOpen(false);
      resetAddForm();
      await queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      navigation.navigate('ContactDetails', {
        contactId: contact.id,
        contactName: getContactTitle(contact),
      });
    },
    onError: (error: Error) => Alert.alert('Could not create contact', error.message),
  });

  const onRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
  }, [queryClient]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.topbarCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Contacts</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Manage and organize your contact database</Text>
        </View>
        <View style={styles.topbarActions}>
          <Pressable style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => setAddOpen(true)} hitSlop={8}>
            <Plus color="#fff" size={18} />
          </Pressable>
          <NotificationBell onOpen={() => setNotificationsOpen(true)} />
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Search color={colors.textMuted} size={18} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Search by name, email, or phone..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <Pressable onPress={() => { setSearch(''); setDebouncedSearch(''); }} hitSlop={8}>
              <X color={colors.textMuted} size={16} />
            </Pressable>
          ) : null}
        </View>
        <Pressable style={[styles.filterButton, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, hasAdvancedFilters && [styles.filterButtonActive, { borderColor: colors.primary }]]} onPress={() => setFilterOpen(true)}>
          <Filter color={hasAdvancedFilters ? colors.primary : colors.textSecondary} size={16} />
          {hasAdvancedFilters ? <View style={[styles.filterDot, { backgroundColor: colors.primary }]} /> : null}
        </Pressable>
      </View>

      <Text style={[styles.countLabel, { color: colors.textSecondary }]}>
        {contactsQuery.isLoading ? 'Loading contacts...' : `${totalCount.toLocaleString()} contacts`}
      </Text>

      {contactsQuery.isError ? (
        <ErrorState
          message={contactsQuery.error instanceof Error ? contactsQuery.error.message : 'Unable to load contacts.'}
          onRetry={() => contactsQuery.refetch()}
        />
      ) : contactsQuery.isLoading ? (
        <ListSkeleton rows={8} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          style={styles.listFill}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={contactsQuery.isRefetching && !contactsQuery.isFetchingNextPage} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (contactsQuery.hasNextPage && !contactsQuery.isFetchingNextPage) {
              void contactsQuery.fetchNextPage();
            }
          }}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <ContactRound color={colors.textMuted} size={44} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No contacts found</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {hasAdvancedFilters || debouncedSearch.trim()
                  ? 'Try adjusting your search or filters.'
                  : 'Add a contact to start building your CRM list.'}
              </Text>
              {hasAdvancedFilters || debouncedSearch.trim() ? (
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
              ) : (
                <Pressable style={[styles.emptyClearButton, { backgroundColor: colors.surfaceSecondary }]} onPress={() => setAddOpen(true)}>
                  <Text style={[styles.emptyClearButtonText, { color: colors.primary }]}>Add contact</Text>
                </Pressable>
              )}
            </View>
          )}
          ListFooterComponent={contactsQuery.isFetchingNextPage ? <View style={{ alignItems: 'center', marginVertical: 16 }}><InlineSkeleton width={140} height={14} /></View> : null}
          renderItem={renderContactRow}
          extraData={navigation}
        />
      )}

      <BottomSheet visible={filterOpen} onClose={() => setFilterOpen(false)} sheetStyle={styles.sheetSurface}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Filters</Text>
            </View>
            <View style={[styles.layerTabs, { backgroundColor: colors.surfaceSecondary }]}>
              {FILTER_LAYERS.map((layer) => {
                const active = filterLayer === layer.id;
                return (
                  <Pressable key={layer.id} style={[styles.layerTab, active && [styles.layerTabActive, { backgroundColor: colors.surface }]]} onPress={() => setFilterLayer(layer.id)}>
                    <Text style={[styles.layerTabText, { color: colors.textSecondary }, active && [styles.layerTabTextActive, { color: colors.text }]]}>{layer.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView style={styles.optionList} keyboardShouldPersistTaps="handled">
              {filterLayer === 'channels' ? (
                <>
                  {channelOptions.map((channel) => {
                    const active = channelIds.includes(channel.id);
                    return (
                      <Pressable
                        key={channel.id}
                        style={[styles.optionRow, active && [styles.optionRowActive, { backgroundColor: colors.surfaceSecondary }]]}
                        onPress={() => setChannelIds((current) => (active ? current.filter((id) => id !== channel.id) : [...current, channel.id]))}
                      >
                        <ChannelLogo type={channel.type ?? channel.channelType} box={28} glyph={14} radius={8} />
                        <Text style={[styles.optionText, { color: colors.textSecondary }, active && [styles.optionTextActive, { color: colors.primary }]]} numberOfLines={1}>
                          {channel.channelName ?? channel.name ?? 'Channel'}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {!channelOptions.length ? <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No channels available.</Text> : null}
                </>
              ) : null}

              {filterLayer === 'labels' ? (
                <>
                  <View style={[styles.inlineSearch, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
                    <Search color={colors.textMuted} size={16} />
                    <TextInput value={tagSearch} onChangeText={setTagSearch} placeholder="Search tags" placeholderTextColor={colors.textMuted} style={[styles.inlineSearchInput, { color: colors.text }]} />
                  </View>
                  {tagOptions.map((tag) => {
                    const active = tagIds.includes(tag.id);
                    const color = tag.color?.trim() || '#64748b';
                    return (
                      <Pressable
                        key={tag.id}
                        style={[styles.optionRow, active && [styles.optionRowActive, { backgroundColor: colors.surfaceSecondary }]]}
                        onPress={() => setTagIds((current) => (active ? current.filter((id) => id !== tag.id) : [...current, tag.id]))}
                      >
                        <View style={[styles.tagDot, { backgroundColor: color }]} />
                        <Text style={[styles.optionText, { color: colors.textSecondary }, active && [styles.optionTextActive, { color: colors.primary }]]} numberOfLines={1}>{tag.text}</Text>
                      </Pressable>
                    );
                  })}
                  {!tagOptions.length ? <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No tags found.</Text> : null}
                </>
              ) : null}

              {filterLayer === 'users' ? (
                <>
                  <View style={[styles.inlineSearch, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
                    <Search color={colors.textMuted} size={16} />
                    <TextInput value={userSearch} onChangeText={setUserSearch} placeholder="Search owners" placeholderTextColor={colors.textMuted} style={[styles.inlineSearchInput, { color: colors.text }]} />
                  </View>
                  <Pressable style={[styles.optionRow, ownerId == null && [styles.optionRowActive, { backgroundColor: colors.surfaceSecondary }]]} onPress={() => setOwnerId(null)}>
                    <Text style={[styles.optionText, { color: colors.textSecondary }, ownerId == null && [styles.optionTextActive, { color: colors.primary }]]}>Any owner</Text>
                  </Pressable>
                  {assigneeOptions.map((member) => {
                    const active = ownerId === member.workspaceMemberId;
                    return (
                      <Pressable key={member.workspaceMemberId} style={[styles.optionRow, active && [styles.optionRowActive, { backgroundColor: colors.surfaceSecondary }]]} onPress={() => setOwnerId(member.workspaceMemberId)}>
                        <Text style={[styles.optionText, { color: colors.textSecondary }, active && [styles.optionTextActive, { color: colors.primary }]]} numberOfLines={1}>
                          {member.name?.trim() || member.email}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}

              {filterLayer === 'more' ? (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Assignment</Text>
                  <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
                    {([
                      ['all', 'All'],
                      ['assigned', 'Assigned'],
                      ['unassigned', 'Unassigned'],
                    ] as const).map(([value, label]) => {
                      const active = assignment === value;
                      return (
                        <Pressable key={value} style={[styles.segmentOption, active && [styles.segmentOptionActive, { backgroundColor: colors.surface }]]} onPress={() => setAssignment(value)}>
                          <Text style={[styles.segmentText, { color: colors.textSecondary }, active && [styles.segmentTextActive, { color: colors.text }]]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable style={[styles.switchRow, { borderColor: colors.cardBorder }]} onPress={() => setRecentlyActive((value) => !value)}>
                    <Text style={[styles.switchLabel, { color: colors.textSecondary }]}>Recently active</Text>
                    <AppToggle value={recentlyActive} variant="sidebar" />
                  </Pressable>
                </>
              ) : null}
            </ScrollView>

            <Pressable style={[styles.resetButton, !hasAdvancedFilters && styles.resetDisabled]} disabled={!hasAdvancedFilters} onPress={resetFilters}>
              <Text style={[styles.resetText, { color: colors.error }, !hasAdvancedFilters && [styles.resetTextDisabled, { color: colors.textMuted }]]}>Reset filters</Text>
            </Pressable>
            <Pressable style={[styles.applyButton, { backgroundColor: colors.primary }]} onPress={() => setFilterOpen(false)}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
        </BottomSheet>

      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)} sheetStyle={styles.sheetSurface}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Add contact</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.addFormScroll}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name *</Text>
              <TextInput value={addName} onChangeText={setAddName} placeholder="Full name" placeholderTextColor={colors.textMuted} style={[styles.fieldInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder, color: colors.text }]} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Phone *</Text>
              <TextInput value={addPhone} onChangeText={setAddPhone} placeholder="+8801XXXXXXXXX" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.fieldInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder, color: colors.text }]} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
              <TextInput value={addEmail} onChangeText={setAddEmail} placeholder="name@example.com" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" style={[styles.fieldInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder, color: colors.text }]} />

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Channel</Text>
              <View style={[styles.inlineSearch, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
                <Search color={colors.textMuted} size={16} />
                <TextInput
                  value={addChannelSearch}
                  onChangeText={setAddChannelSearch}
                  placeholder="Search channels"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inlineSearchInput, { color: colors.text }]}
                />
              </View>
              {visibleAddChannels.map((option) => {
                const active = resolvedAddChannelIds[0] === option.accountId;
                return (
                  <Pressable
                    key={option.accountId}
                    style={[styles.optionRow, active && [styles.optionRowActive, { backgroundColor: colors.surfaceSecondary }]]}
                    onPress={() => setAddChannelAccountId(option.accountId)}
                  >
                    <ChannelLogo type={option.channelType} box={28} glyph={14} radius={8} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.optionText, { color: colors.textSecondary }, active && [styles.optionTextActive, { color: colors.primary }]]} numberOfLines={1}>{option.channelName}</Text>
                      {option.displayPhoneNumber ? (
                        <Text style={[styles.optionSubtext, { color: colors.textMuted }]} numberOfLines={1}>{option.displayPhoneNumber}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {!visibleAddChannels.length ? <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No WhatsApp channels available.</Text> : null}

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Tags</Text>
              {addTags.length ? (
                <View style={styles.addSelectedTags}>
                  {addTags.map((tag) => (
                    <Pressable
                      key={tag}
                      style={[styles.addSelectedTag, { backgroundColor: colors.surfaceSecondary }]}
                      onPress={() => setAddTags((current) => current.filter((item) => item !== tag))}
                    >
                      <Text style={[styles.addSelectedTagText, { color: colors.primary }]}>{tag}</Text>
                      <X color={colors.primary} size={12} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={[styles.inlineSearch, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
                <Search color={colors.textMuted} size={16} />
                <TextInput
                  value={addTagSearch}
                  onChangeText={setAddTagSearch}
                  placeholder="Search tags"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inlineSearchInput, { color: colors.text }]}
                />
              </View>
              {visibleAddTags.map((tag) => (
                <Pressable
                  key={tag}
                  style={styles.optionRow}
                  onPress={() => {
                    setAddTags((current) => (current.includes(tag) ? current : [...current, tag]));
                    setAddTagSearch('');
                  }}
                >
                  <Text style={[styles.optionText, { color: colors.textSecondary }]}>{tag}</Text>
                  <Plus color={colors.primary} size={14} />
                </Pressable>
              ))}
              {canCreateAddTag ? (
                <Pressable
                  style={[styles.createTagRow, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => {
                    const next = addTagSearch.trim();
                    setAddTags((current) => (current.includes(next) ? current : [...current, next]));
                    setAddTagSearch('');
                  }}
                >
                  <Plus color={colors.primary} size={14} />
                  <Text style={[styles.createTagRowText, { color: colors.primary }]}>Create “{addTagSearch.trim()}”</Text>
                </Pressable>
              ) : null}
              {!visibleAddTags.length && !canCreateAddTag ? (
                <Text style={[styles.emptyHint, { color: colors.textMuted }]}>{addTagSearch.trim() ? 'No tags match your search.' : 'No more tags to add.'}</Text>
              ) : null}
            </ScrollView>

            <Pressable
              style={[styles.applyButton, { backgroundColor: colors.primary }, (!addName.trim() || !addPhone.trim() || createMutation.isPending) && styles.applyDisabled]}
              disabled={!addName.trim() || !addPhone.trim() || createMutation.isPending}
              onPress={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.applyText}>Add contact</Text>}
            </Pressable>
        </BottomSheet>

      <NotificationCenter visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </View>
  );
}

const ContactRow = memo(function ContactRow({ contact, navigation }: { contact: CrmContactListItem; navigation: any }) {
  const { colors } = useTheme();
  const title = getContactTitle(contact);
  const phone = formatPhoneNumberDisplay(contact.primaryPhone);
  const tags = (contact.tags ?? []).filter((tag) => !tag.isArchived).slice(0, 2);
  const hiddenTagCount = Math.max(0, (contact.tags ?? []).filter((tag) => !tag.isArchived).length - tags.length);
  const onPress = useCallback(() => {
    navigation.navigate('ContactDetails', { contactId: contact.id, contactName: title });
  }, [navigation, contact.id, title]);

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={styles.avatar}>
        <ColorfulAvatar name={title} size={48} url={contact.avatarUrl} />
        {contact.channelType ? (
          <View style={[styles.channelBadge, { borderColor: colors.surface }]}>
            <ChannelLogo type={contact.channelType} box={18} glyph={11} radius={9} />
          </View>
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <View style={styles.metaRow}>
          <Phone color={colors.textMuted} size={12} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>{phone ?? 'No phone'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Mail color={colors.textMuted} size={12} />
          <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>{contact.primaryEmail?.trim() || 'No email'}</Text>
        </View>
        {contact.channelName ? (
          <View style={styles.channelPill}>
            <Text style={styles.channelPillText} numberOfLines={1}>{contact.channelName}</Text>
          </View>
        ) : null}
        {tags.length ? (
          <View style={styles.tagRow}>
            {tags.map((tag) => {
              const color = tag.color?.trim() || '#64748b';
              return (
                <View key={tag.id} style={[styles.tagChip, { backgroundColor: hexWithAlpha(color), borderColor: hexWithAlpha(color, '33') }]}>
                  <Text style={[styles.tagChipText, { color }]} numberOfLines={1}>{tag.text}</Text>
                </View>
              );
            })}
            {hiddenTagCount > 0 ? <Text style={[styles.tagMore, { color: colors.textSecondary }]}>+{hiddenTagCount}</Text> : null}
          </View>
        ) : null}
      </View>
      <Text style={[styles.activity, { color: colors.textMuted }]}>{formatRelativeActivity(contact.lastActivityAt)}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: { backgroundColor: '#eef4fb', flex: 1 },
  topbar: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 18 },
  topbarCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  topbarActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 4 },
  addButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16 },
  search: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 22, borderWidth: 1, flex: 1, flexDirection: 'row', paddingHorizontal: 12 },
  searchInput: { color: '#17233a', flex: 1, height: 44, marginLeft: 8 },
  filterButton: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 18, borderWidth: 1, height: 44, justifyContent: 'center', position: 'relative', width: 44 },
  filterButtonActive: { borderColor: '#2563eb' },
  filterDot: { backgroundColor: '#2563eb', borderRadius: 4, height: 8, position: 'absolute', right: 8, top: 8, width: 8 },
  countLabel: { color: '#64748b', fontSize: 12, fontWeight: '600', marginHorizontal: 18, marginTop: 12 },
  listFill: { flex: 1 },
  list: { gap: 10, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 12 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  avatar: { alignItems: 'center', backgroundColor: 'transparent', borderRadius: 24, height: 48, justifyContent: 'center', position: 'relative', width: 48 },
  avatarImage: { borderRadius: 24, height: 48, width: 48 },
  avatarText: { color: '#1d4ed8', fontSize: 15, fontWeight: '700' },
  channelBadge: { borderColor: '#fff', borderRadius: 10, borderWidth: 2, bottom: -2, overflow: 'hidden', position: 'absolute', right: -2 },
  copy: { flex: 1, minWidth: 0 },
  name: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 4 },
  metaText: { color: '#64748b', flex: 1, fontSize: 12 },
  channelPill: { alignSelf: 'flex-start', backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderRadius: 999, borderWidth: 1, marginTop: 8, paddingHorizontal: 10, paddingVertical: 4 },
  channelPillText: { color: '#9a3412', fontSize: 11, fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tagChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  tagChipText: { fontSize: 11, fontWeight: '600' },
  tagMore: { alignSelf: 'center', color: '#64748b', fontSize: 11, fontWeight: '600' },
  activity: { color: '#94a3b8', fontSize: 11, fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700', marginTop: 14 },
  emptyText: { color: '#64748b', fontSize: 13, marginTop: 5, maxWidth: 260, textAlign: 'center' },
  emptyClearButton: { backgroundColor: '#eff6ff', borderRadius: 12, marginTop: 14, paddingHorizontal: 14, paddingVertical: 10 },
  emptyClearButtonText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  loader: { marginTop: 60 },
  sheetOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheetSurface: { paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  layerTabs: { backgroundColor: '#f1f5f9', borderRadius: 14, flexDirection: 'row', gap: 4, marginBottom: 12, padding: 4 },
  layerTab: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 8 },
  layerTabActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  layerTabText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  layerTabTextActive: { color: '#0f172a', fontWeight: '700' },
  optionList: { gap: 6, maxHeight: 320 },
  optionRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 10 },
  optionRowActive: { backgroundColor: '#dbeafe' },
  optionText: { color: '#334155', flex: 1, fontSize: 14, fontWeight: '500' },
  optionTextActive: { color: '#1d4ed8', fontWeight: '700' },
  tagDot: { borderRadius: 5, height: 10, width: 10 },
  emptyHint: { color: '#94a3b8', fontSize: 13, paddingVertical: 12 },
  inlineSearch: { alignItems: 'center', backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginBottom: 8, paddingHorizontal: 10 },
  inlineSearchInput: { color: '#17233a', flex: 1, height: 40, marginLeft: 8 },
  sectionLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8, textTransform: 'uppercase' },
  segment: { backgroundColor: '#f1f5f9', borderRadius: 20, flexDirection: 'row', marginBottom: 12, padding: 4 },
  segmentOption: { alignItems: 'center', borderRadius: 16, flex: 1, paddingVertical: 8 },
  segmentOptionActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  segmentText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: '#0f172a', fontWeight: '700' },
  switchRow: { alignItems: 'center', borderColor: '#dbeafe', borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  switchLabel: { color: '#334155', fontSize: 14, fontWeight: '600' },
  resetButton: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  resetDisabled: { opacity: 0.45 },
  resetText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  resetTextDisabled: { color: '#94a3b8' },
  applyButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, marginTop: 10, paddingVertical: 14 },
  applyDisabled: { opacity: 0.55 },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fieldLabel: { color: '#334155', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  fieldInput: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, color: '#0f172a', paddingHorizontal: 12, paddingVertical: 12 },
  addFormScroll: { maxHeight: 420 },
  optionSubtext: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  addSelectedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  addSelectedTag: { alignItems: 'center', backgroundColor: '#dbeafe', borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 5 },
  addSelectedTagText: { color: '#1d4ed8', fontSize: 12, fontWeight: '600' },
  createTagRow: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, flexDirection: 'row', gap: 8, marginTop: 4, paddingHorizontal: 10, paddingVertical: 10 },
  createTagRowText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
});
