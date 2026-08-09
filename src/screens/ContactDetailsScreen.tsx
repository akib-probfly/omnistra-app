import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, MessageSquareText, Phone, Plus, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addCrmContactNote,
  fetchCrmContact,
  formatPhoneNumberDisplay,
  getContactTitle,
  updateCrmContactDetail,
} from '../api/contacts';
import { createWorkspaceTag, fetchWorkspaceTags } from '../api/conversationDetails';
import { AuthenticatedImage } from '../components/AuthenticatedImage';
import { ChannelLogo } from '../components/ChannelLogo';
import { ErrorState } from '../components/ErrorState';
import type { ContactsStackParamList } from '../navigation/ContactsStack';

const TAG_COLOR_OPTIONS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

function getInitials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ContactDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ContactsStackParamList>>();
  const route = useRoute<RouteProp<ContactsStackParamList, 'ContactDetails'>>();
  const queryClient = useQueryClient();
  const { contactId, contactName } = route.params;
  const [noteDraft, setNoteDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_OPTIONS[0]);

  const contactQuery = useQuery({
    queryKey: ['crm-contact', contactId],
    queryFn: () => fetchCrmContact(contactId),
    staleTime: 20_000,
  });

  const workspaceTagsQuery = useQuery({
    queryKey: ['workspace-tags', 'contact-details'],
    queryFn: () => fetchWorkspaceTags(),
    staleTime: 60_000,
  });

  const contact = contactQuery.data;
  const title = contact ? getContactTitle(contact) : contactName;
  const phone = formatPhoneNumberDisplay(contact?.primaryPhone);
  const contactTags = useMemo(() => (contact?.tags ?? []).filter((tag) => !tag.isArchived), [contact?.tags]);
  const workspaceTags = useMemo(
    () => (workspaceTagsQuery.data?.items ?? []).filter((tag) => !tag.isArchived),
    [workspaceTagsQuery.data?.items],
  );

  useEffect(() => {
    if (!contact) return;
    setSelectedTagIds(contactTags.map((tag) => tag.id));
  }, [contact?.id, contactTags]);

  const selectedTags = useMemo(() => {
    const byId = new Map<string, { id: string; text: string; color?: string | null }>();
    for (const tag of workspaceTags) byId.set(tag.id, tag);
    for (const tag of contactTags) byId.set(tag.id, tag);
    return selectedTagIds.map((id) => byId.get(id)).filter((tag): tag is { id: string; text: string; color?: string | null } => Boolean(tag));
  }, [selectedTagIds, workspaceTags, contactTags]);

  const searchableTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    const available = workspaceTags.filter((tag) => !selectedTagIds.includes(tag.id));
    if (!query) return available.slice(0, 5);
    return available
      .filter((tag) => tag.text.toLowerCase().includes(query))
      .slice(0, 5);
  }, [workspaceTags, selectedTagIds, tagSearch]);

  const canCreateTag = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return false;
    return !workspaceTags.some((tag) => tag.text.toLowerCase() === query);
  }, [tagSearch, workspaceTags]);

  const tagsDirty = useMemo(() => {
    const current = contactTags.map((tag) => tag.id).sort().join('|');
    const next = [...selectedTagIds].sort().join('|');
    return current !== next;
  }, [contactTags, selectedTagIds]);

  const conversations = useMemo(
    () => [...(contact?.conversations ?? [])].sort((left, right) => {
      const leftAt = Date.parse(left.lastMessageAt ?? left.createdAt);
      const rightAt = Date.parse(right.lastMessageAt ?? right.createdAt);
      return (Number.isFinite(rightAt) ? rightAt : 0) - (Number.isFinite(leftAt) ? leftAt : 0);
    }),
    [contact?.conversations],
  );
  const notes = useMemo(
    () => [...(contact?.notes ?? [])].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [contact?.notes],
  );

  const updateMutation = useMutation({
    mutationFn: (input: { displayName?: string | null; primaryEmail?: string | null; tagIds?: string[] }) => updateCrmContactDetail(contactId, input),
    onSuccess: async () => {
      setEmailDraft(null);
      setNameDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['crm-contact', contactId] });
      await queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    },
    onError: (error: Error) => Alert.alert('Could not update contact', error.message),
  });

  const createTagMutation = useMutation({
    mutationFn: async () => {
      const created = await createWorkspaceTag({ text: tagSearch.trim(), color: newTagColor });
      const nextIds = selectedTagIds.includes(created.id) ? selectedTagIds : [...selectedTagIds, created.id];
      await updateCrmContactDetail(contactId, { tagIds: nextIds });
      return { created, nextIds };
    },
    onSuccess: async ({ nextIds }) => {
      setSelectedTagIds(nextIds);
      setTagSearch('');
      await queryClient.invalidateQueries({ queryKey: ['workspace-tags'] });
      await queryClient.invalidateQueries({ queryKey: ['crm-contact', contactId] });
      await queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    },
    onError: (error: Error) => Alert.alert('Could not create tag', error.message),
  });

  const noteMutation = useMutation({
    mutationFn: () => addCrmContactNote(contactId, noteDraft.trim()),
    onSuccess: async () => {
      setNoteDraft('');
      await queryClient.invalidateQueries({ queryKey: ['crm-contact', contactId] });
    },
    onError: (error: Error) => Alert.alert('Could not add note', error.message),
  });

  const openConversation = (conversationId: string) => {
    navigation.dispatch(
      CommonActions.navigate({
        name: 'Inbox',
        params: {
          screen: 'Conversation',
          params: {
            conversationId,
            contactName: title,
          },
        },
      }),
    );
  };

  const openLatestConversation = () => {
    const latest = conversations[0];
    if (!latest) {
      Alert.alert('No conversations', 'This contact does not have any conversations yet.');
      return;
    }
    openConversation(latest.id);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <ArrowLeft color="#0f172a" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.headerSubtitle}>Contact details</Text>
        </View>
        <Pressable style={styles.messageButton} onPress={openLatestConversation}>
          <MessageSquareText color="#2563eb" size={18} />
        </Pressable>
      </View>

      {contactQuery.isLoading ? (
        <ActivityIndicator color="#2563eb" style={styles.loader} />
      ) : contactQuery.isError || !contact ? (
        <ErrorState
          message={contactQuery.error instanceof Error ? contactQuery.error.message : 'Unable to load contact.'}
          onRetry={() => contactQuery.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              {contact.avatarUrl ? (
                <AuthenticatedImage url={contact.avatarUrl} resizeMode="cover" style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{getInitials(title)}</Text>
              )}
              {contact.channelType ? (
                <View style={styles.channelBadge}>
                  <ChannelLogo type={contact.channelType} box={22} glyph={13} radius={11} />
                </View>
              ) : null}
            </View>
            <Text style={styles.profileName}>{title}</Text>
            {contact.channelName ? <Text style={styles.profileChannel}>{contact.channelName}</Text> : null}
            <View style={styles.profileMeta}>
              <View style={styles.metaChip}>
                <Phone color="#64748b" size={14} />
                <Text style={styles.metaChipText}>{phone ?? 'No phone'}</Text>
              </View>
              <View style={styles.metaChip}>
                <Mail color="#64748b" size={14} />
                <Text style={styles.metaChipText}>{contact.primaryEmail?.trim() || 'No email'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile</Text>
            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              value={nameDraft ?? contact.displayName ?? ''}
              onChangeText={setNameDraft}
              placeholder="Contact name"
              placeholderTextColor="#94a3b8"
              style={styles.fieldInput}
            />
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              value={emailDraft ?? contact.primaryEmail ?? ''}
              onChangeText={setEmailDraft}
              placeholder="name@example.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.fieldInput}
            />
            <Text style={styles.helperText}>Phone: {phone ?? '-'}</Text>
            <Text style={styles.helperText}>Last active: {formatDateTime(contact.lastActivityAt)}</Text>
            <Text style={styles.helperText}>Added: {formatDateTime(contact.createdAt)}</Text>
            {(nameDraft != null && nameDraft !== (contact.displayName ?? '')) || (emailDraft != null && emailDraft !== (contact.primaryEmail ?? '')) ? (
              <Pressable
                style={[styles.saveButton, updateMutation.isPending && styles.saveDisabled]}
                disabled={updateMutation.isPending}
                onPress={() => updateMutation.mutate({
                  displayName: nameDraft ?? contact.displayName,
                  primaryEmail: emailDraft ?? contact.primaryEmail,
                })}
              >
                {updateMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save changes</Text>}
              </Pressable>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tags</Text>
            {selectedTags.length ? (
              <View style={styles.tagRow}>
                {selectedTags.map((tag) => {
                  const color = tag.color?.trim() || '#64748b';
                  return (
                    <Pressable
                      key={tag.id}
                      style={[styles.tagChip, { backgroundColor: `${color}18`, borderColor: `${color}33` }]}
                      onPress={() => setSelectedTagIds((current) => current.filter((id) => id !== tag.id))}
                    >
                      <Text style={[styles.tagChipText, { color }]}>{tag.text}</Text>
                      <X color={color} size={12} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptySection}>No tags yet. Search or create one below.</Text>
            )}

            <View style={styles.tagSearch}>
              <Search color="#94a3b8" size={16} />
              <TextInput
                value={tagSearch}
                onChangeText={setTagSearch}
                placeholder="Search tags to add"
                placeholderTextColor="#94a3b8"
                style={styles.tagSearchInput}
              />
              {tagSearch ? (
                <Pressable onPress={() => setTagSearch('')} hitSlop={8}>
                  <X color="#94a3b8" size={16} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.tagPickerList}>
              {searchableTags.map((tag) => {
                const color = tag.color?.trim() || '#64748b';
                return (
                  <Pressable
                    key={tag.id}
                    style={styles.tagOption}
                    onPress={() => {
                      setSelectedTagIds((current) => (current.includes(tag.id) ? current : [...current, tag.id]));
                      setTagSearch('');
                    }}
                  >
                    <View style={[styles.tagDot, { backgroundColor: color }]} />
                    <Text style={styles.tagOptionText} numberOfLines={1}>{tag.text}</Text>
                    <Plus color="#2563eb" size={14} />
                  </Pressable>
                );
              })}
              {!workspaceTagsQuery.isLoading && !searchableTags.length ? (
                <Text style={styles.emptySection}>
                  {tagSearch.trim() ? 'No workspace tags match your search.' : 'No more tags to add.'}
                </Text>
              ) : null}
            </View>

            {canCreateTag ? (
              <View style={styles.createTagBox}>
                <Text style={styles.createTagLabel}>Create “{tagSearch.trim()}”</Text>
                <View style={styles.colorRow}>
                  {TAG_COLOR_OPTIONS.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setNewTagColor(color)}
                      style={[styles.colorSwatch, { backgroundColor: color }, newTagColor === color && styles.colorSwatchActive]}
                    />
                  ))}
                </View>
                <Pressable
                  style={[styles.createTagButton, createTagMutation.isPending && styles.saveDisabled]}
                  disabled={createTagMutation.isPending}
                  onPress={() => createTagMutation.mutate()}
                >
                  {createTagMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Plus color="#fff" size={14} />
                      <Text style={styles.saveButtonText}>Create & assign</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}

            {tagsDirty ? (
              <Pressable
                style={[styles.saveButton, updateMutation.isPending && styles.saveDisabled]}
                disabled={updateMutation.isPending}
                onPress={() => updateMutation.mutate({ tagIds: selectedTagIds })}
              >
                {updateMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save tags</Text>}
              </Pressable>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conversations</Text>
            {conversations.length ? conversations.map((conversation) => (
              <Pressable key={conversation.id} style={styles.conversationRow} onPress={() => openConversation(conversation.id)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.conversationStatus}>{conversation.status}</Text>
                  <Text style={styles.conversationPreview} numberOfLines={1}>
                    {conversation.lastMessagePreview?.trim() || 'No messages yet'}
                  </Text>
                </View>
                <Text style={styles.conversationTime}>{formatDateTime(conversation.lastMessageAt ?? conversation.createdAt)}</Text>
              </Pressable>
            )) : (
              <Text style={styles.emptySection}>No conversations linked to this contact.</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Add a note..."
              placeholderTextColor="#94a3b8"
              multiline
              style={styles.noteInput}
            />
            <Pressable
              style={[styles.saveButton, (!noteDraft.trim() || noteMutation.isPending) && styles.saveDisabled]}
              disabled={!noteDraft.trim() || noteMutation.isPending}
              onPress={() => noteMutation.mutate()}
            >
              {noteMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Add note</Text>}
            </Pressable>
            {notes.length ? notes.map((note) => (
              <View key={note.id} style={styles.noteCard}>
                <Text style={styles.noteBody}>{note.body}</Text>
                <Text style={styles.noteMeta}>
                  {note.author.userName?.trim() || note.author.userEmail} · {formatDateTime(note.createdAt)}
                </Text>
              </View>
            )) : (
              <Text style={styles.emptySection}>No notes yet.</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#eef4fb', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 12, paddingHorizontal: 14 },
  backButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  messageButton: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  loader: { marginTop: 60 },
  content: { gap: 12, padding: 16 },
  profileCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, padding: 18 },
  avatar: { alignItems: 'center', backgroundColor: '#dbeafe', borderRadius: 36, height: 72, justifyContent: 'center', position: 'relative', width: 72 },
  avatarImage: { borderRadius: 36, height: 72, width: 72 },
  avatarText: { color: '#1d4ed8', fontSize: 24, fontWeight: '700' },
  channelBadge: { borderColor: '#fff', borderRadius: 12, borderWidth: 2, bottom: -2, overflow: 'hidden', position: 'absolute', right: -2 },
  profileName: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 12 },
  profileChannel: { color: '#64748b', fontSize: 13, marginTop: 4 },
  profileMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 },
  metaChip: { alignItems: 'center', backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  metaChipText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  section: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, padding: 16 },
  sectionTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800', marginBottom: 10 },
  fieldLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  fieldInput: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, color: '#0f172a', paddingHorizontal: 12, paddingVertical: 11 },
  helperText: { color: '#64748b', fontSize: 12, marginTop: 8 },
  saveButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, marginTop: 12, paddingVertical: 12 },
  saveDisabled: { opacity: 0.55 },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tagChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 5 },
  tagChipText: { fontSize: 12, fontWeight: '600' },
  tagSearch: { alignItems: 'center', backgroundColor: '#fffaf0', borderColor: '#cfe1ff', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 4, paddingHorizontal: 10 },
  tagSearchInput: { color: '#0f172a', flex: 1, height: 42, marginLeft: 8 },
  tagPickerList: { gap: 4, marginTop: 10 },
  tagOption: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 10 },
  tagOptionActive: { backgroundColor: '#dbeafe' },
  tagOptionText: { color: '#334155', flex: 1, fontSize: 14, fontWeight: '500' },
  tagOptionTextActive: { color: '#1d4ed8', fontWeight: '700' },
  tagDot: { borderRadius: 5, height: 10, width: 10 },
  createTagBox: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 14, borderWidth: 1, marginTop: 10, padding: 12 },
  createTagLabel: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  colorSwatch: { borderRadius: 12, height: 24, width: 24 },
  colorSwatchActive: { borderColor: '#0f172a', borderWidth: 2 },
  createTagButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 12, paddingVertical: 11 },
  conversationRow: { borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 8, padding: 12 },
  conversationStatus: { color: '#2563eb', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  conversationPreview: { color: '#334155', fontSize: 13, marginTop: 3 },
  conversationTime: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  emptySection: { color: '#94a3b8', fontSize: 13 },
  noteInput: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, color: '#0f172a', minHeight: 84, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  noteCard: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, marginTop: 10, padding: 12 },
  noteBody: { color: '#0f172a', fontSize: 13, lineHeight: 18 },
  noteMeta: { color: '#94a3b8', fontSize: 11, marginTop: 6 },
});
