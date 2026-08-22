import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  Check,
  ChevronDown,
  MessageSquareText,
  Paperclip,
  PencilLine,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react-native';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { AppButton, ScreenHeader } from '../ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  createQuickReply,
  deleteQuickReply,
  deleteWorkspaceFile,
  fetchQuickRepliesList,
  formatQuickReplyChannelScope,
  channelScopeFromAccountTypes,
  getUnsupportedQuickReplyVariables,
  isQuickReplyImageAttachment,
  quickReplyAttachmentPreviewUrl,
  renderQuickReplyPreview,
  updateQuickReply,
  uploadQuickReplyAttachment,
  type QuickReplyAttachment,
  type QuickReplySnippet,
} from '../api/quickReplies';
import { fetchChannels, type ChannelType } from '../api/channels';
import { fetchMyWorkspaces } from '../api/workspaces';
import { ErrorState } from '../components/ErrorState';
import { BottomSheet, SheetFlatList, SheetScrollView } from '../components/BottomSheet';
import { FormSkeleton, ListSkeleton } from '../components/Skeleton';
import { AuthenticatedImage } from '../components/AuthenticatedImage';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 100;

type ChannelAccountOption = {
  id: string;
  label: string;
  description: string;
  type: ChannelType;
};

type FormState = {
  title: string;
  body: string;
  attachments: QuickReplyAttachment[];
  channelAccountIds: string[];
};

function emptyForm(): FormState {
  return { title: '', body: '', attachments: [], channelAccountIds: [] };
}

function selectedAccountIds(snippet: QuickReplySnippet, accounts: ChannelAccountOption[]) {
  const savedIds = (snippet.channelAccountIds ?? []).filter(Boolean);
  if (savedIds.length > 0) {
    if (accounts.length === 0) return savedIds;
    return savedIds.filter((id) => accounts.some((account) => account.id === id));
  }

  const scope = (snippet.channelScope ?? 'ALL').toUpperCase();
  if (!scope || scope === 'ALL') return [];
  return accounts.filter((account) => account.type === scope).map((account) => account.id);
}

function toForm(snippet: QuickReplySnippet | null, accounts: ChannelAccountOption[]): FormState {
  if (!snippet) return emptyForm();
  return {
    title: snippet.title ?? '',
    body: snippet.body ?? '',
    attachments: snippet.attachments ?? [],
    channelAccountIds: selectedAccountIds(snippet, accounts),
  };
}

export function QuickRepliesSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuickReplySnippet | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [newAttachmentIds, setNewAttachmentIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<QuickReplySnippet | null>(null);
  const [channelSearch, setChannelSearch] = useState('');
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspaceId = workspacesQuery.data?.items?.[0]?.id;

  const channelsQuery = useQuery({
    queryKey: ['channels'],
    queryFn: fetchChannels,
    staleTime: 60_000,
  });

  const channelAccountOptions = useMemo<ChannelAccountOption[]>(
    () => (channelsQuery.data?.items ?? []).flatMap((channel) =>
      (channel.accounts ?? []).map((account) => ({
        id: account.id,
        label: account.displayName || account.pageName || account.displayPhoneNumber || channel.name,
        description: `${channel.name} · ${channel.type}`,
        type: channel.type,
      })),
    ),
    [channelsQuery.data?.items],
  );

  const selectedChannelAccounts = useMemo(
    () => channelAccountOptions.filter((account) => form.channelAccountIds.includes(account.id)),
    [channelAccountOptions, form.channelAccountIds],
  );

  const visibleChannelAccounts = useMemo(() => {
    const query = channelSearch.trim().toLowerCase();
    if (!query) return channelAccountOptions;
    return channelAccountOptions.filter((account) =>
      `${account.label} ${account.description}`.toLowerCase().includes(query),
    );
  }, [channelAccountOptions, channelSearch]);

  const listQuery = useQuery({
    queryKey: ['quick-replies', 'settings', workspaceId, deferredSearch],
    queryFn: () => fetchQuickRepliesList({ workspaceId, search: deferredSearch || undefined, limit: 100 }),
    enabled: Boolean(workspaceId),
    staleTime: 20_000,
  });

  const items = listQuery.data?.items ?? [];
  const unsupportedVars = useMemo(() => getUnsupportedQuickReplyVariables(form.body), [form.body]);
  const previewText = useMemo(() => renderQuickReplyPreview(form.body), [form.body]);
  const savingDisabled = uploading || !form.title.trim() || !form.body.trim();

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] }),
      queryClient.invalidateQueries({ queryKey: ['quick-replies', 'settings'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: createQuickReply,
    onSuccess: async () => { await invalidate(); },
  });
  const updateMutation = useMutation({
    mutationFn: updateQuickReply,
    onSuccess: async () => { await invalidate(); },
  });
  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => deleteQuickReply(id, workspaceId!),
    onSuccess: async () => { await invalidate(); },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setChannelSearch('');
    setChannelPickerOpen(false);
    setNewAttachmentIds([]);
    setEditorOpen(true);
  };

  const openEdit = (snippet: QuickReplySnippet) => {
    setEditing(snippet);
    setForm(toForm(snippet, channelAccountOptions));
    setChannelSearch('');
    setChannelPickerOpen(false);
    setNewAttachmentIds([]);
    setEditorOpen(true);
  };

  useEffect(() => {
    if (!editorOpen || !editing || channelAccountOptions.length === 0) return;
    setForm((current) => {
      if (current.channelAccountIds.length > 0) return current;
      const nextIds = selectedAccountIds(editing, channelAccountOptions);
      if (nextIds.length === 0) return current;
      return { ...current, channelAccountIds: nextIds };
    });
  }, [channelAccountOptions, editing, editorOpen]);

  const cleanupNewAttachments = async (ids: string[]) => {
    await Promise.all(ids.map((id) => deleteWorkspaceFile(id).catch(() => undefined)));
  };

  const closeEditor = () => {
    const pending = newAttachmentIds;
    setEditorOpen(false);
    setEditing(null);
    setForm(emptyForm());
    setNewAttachmentIds([]);
    setChannelSearch('');
    setChannelPickerOpen(false);
    if (pending.length) void cleanupNewAttachments(pending);
  };

  useEffect(() => () => {
    if (newAttachmentIds.length) void cleanupNewAttachments(newAttachmentIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickAttachments = async (source: 'image' | 'document') => {
    if (!workspaceId) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - form.attachments.length);
    if (remaining === 0) {
      Toast.show({ type: 'info', text1: 'Attachment limit', text2: `Quick replies can include up to ${MAX_ATTACHMENTS} attachments.` });
      return;
    }

    let files: Array<{ uri: string; name: string; mimeType: string; size?: number | null }> = [];
    if (source === 'image') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Toast.show({ type: 'info', text1: 'Permission required', text2: 'Allow photo library access to attach images.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      files = result.assets.map((asset, index) => ({
        uri: asset.uri,
        name: asset.fileName ?? `attachment-${index + 1}`,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.fileSize ?? null,
      }));
    } else {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      files = result.assets.slice(0, remaining).map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? null,
      }));
    }

    const uploadable = files.filter((file) => (file.size ?? 0) <= MAX_ATTACHMENT_BYTES || file.size == null);
    const oversized = files.length - uploadable.length;
    if (oversized > 0) {
      Toast.show({ type: 'info', text1: 'Some files are too large', text2: 'Quick reply attachments must be 5 MB or smaller.' });
    }
    if (uploadable.length === 0) return;

    setUploading(true);
    try {
      for (const file of uploadable) {
        const uploaded = await uploadQuickReplyAttachment(workspaceId, file.uri, file.name, file.mimeType);
        const nextAttachment: QuickReplyAttachment = {
          ...uploaded,
          originalName: uploaded.originalName ?? file.name,
          mimeType: uploaded.mimeType ?? file.mimeType,
          localUri: file.uri,
        };
        setNewAttachmentIds((current) => [...current, uploaded.id]);
        setForm((current) => ({
          ...current,
          attachments: [...current.attachments.filter((item) => item.id !== uploaded.id), nextAttachment],
        }));
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Upload failed', text2: error instanceof Error ? error.message : 'Could not upload attachment.' });
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setForm((current) => ({
      ...current,
      attachments: current.attachments.filter((item) => item.id !== attachmentId),
    }));
    if (newAttachmentIds.includes(attachmentId)) {
      setNewAttachmentIds((current) => current.filter((id) => id !== attachmentId));
      void deleteWorkspaceFile(attachmentId).catch(() => undefined);
    }
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) {
      Toast.show({ type: 'info', text1: 'Missing fields', text2: 'Title and message are required.' });
      return;
    }
    if (unsupportedVars.length > 0) {
      Toast.show({
        type: 'info',
        text1: 'Unsupported variable',
        text2: `${unsupportedVars.join(', ')} ${unsupportedVars.length > 1 ? 'are' : 'is'} not supported. Supported: {{name}}.`,
      });
      return;
    }
    if (uploading) {
      Toast.show({ type: 'info', text1: 'Still uploading', text2: 'Wait for attachments to finish uploading.' });
      return;
    }

    try {
      const attachmentIds = form.attachments.map((item) => item.id);
      const selectedTypes = channelAccountOptions
        .filter((account) => form.channelAccountIds.includes(account.id))
        .map((account) => account.type);
      const channelScope = channelScopeFromAccountTypes(selectedTypes);
      if (editing) {
        await updateMutation.mutateAsync({
          quickReplyId: editing.id,
          workspaceId,
          title,
          body,
          isActive: true,
          attachmentIds,
          channelScope,
          channelAccountIds: form.channelAccountIds,
        });
      } else {
        await createMutation.mutateAsync({
          workspaceId,
          title,
          body,
          isActive: true,
          attachmentIds,
          channelScope,
          channelAccountIds: form.channelAccountIds,
        });
      }
      setNewAttachmentIds([]);
      setEditorOpen(false);
      setEditing(null);
      setForm(emptyForm());
      Toast.show({ type: 'success', text1: editing ? 'Quick reply updated' : 'Quick reply created' });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: editing ? 'Could not update quick reply' : 'Could not create quick reply',
        text2: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const confirmDelete = (snippet: QuickReplySnippet) => setPendingDelete(snippet);

  const insertNameVariable = () => {
    setForm((current) => ({
      ...current,
      body: current.body ? `${current.body}{{name}}` : '{{name}}',
    }));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Quick Replies"
        subtitle="Saved snippets for faster replies"
        onBack={() => navigation.goBack()}
        right={
          <Pressable style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={openCreate}>
            <Plus color="#fff" size={18} />
          </Pressable>
        }
      />

      {workspacesQuery.isLoading ? (
        <FormSkeleton fields={4} />
      ) : workspacesQuery.isError || !workspaceId ? (
        <ErrorState
          message={workspacesQuery.error instanceof Error ? workspacesQuery.error.message : 'Unable to load workspace.'}
          onRetry={() => workspacesQuery.refetch()}
        />
      ) : (
        <>
          <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
            <Search color={colors.textMuted} size={16} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or message"
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>

          {listQuery.isLoading ? (
            <ListSkeleton rows={6} avatar={false} />
          ) : listQuery.isError ? (
            <ErrorState
              message={listQuery.error instanceof Error ? listQuery.error.message : 'Unable to load quick replies.'}
              onRetry={() => listQuery.refetch()}
            />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
              ListEmptyComponent={(
                <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  <MessageSquareText color={colors.textMuted} size={28} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No quick replies yet</Text>
                  <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Create a snippet to reuse across conversations.</Text>
                  <AppButton block style={styles.primaryButtonSpacing} icon={Plus} label="Add quick reply" onPress={openCreate} />
                </View>
              )}
              renderItem={({ item }) => (
                <View style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  <View style={styles.itemIcon}>
                    <MessageSquareText color={colors.primary} size={18} />
                  </View>
                  <View style={styles.itemCopy}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.itemBody, { color: colors.textSecondary }]} numberOfLines={2}>{item.body}</Text>
                    <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                      {formatQuickReplyChannelScope(item.channelScope)}
                      {(item.attachments?.length ?? 0) > 0 ? ` · ${item.attachments.length} attachment${item.attachments.length === 1 ? '' : 's'}` : ''}
                    </Text>
                  </View>
                  <Pressable style={styles.iconButton} onPress={() => openEdit(item)} hitSlop={8}>
                    <PencilLine color={colors.primary} size={18} />
                  </Pressable>
                  <Pressable style={styles.iconButton} onPress={() => confirmDelete(item)} hitSlop={8}>
                    <Trash2 color="#e11d48" size={18} />
                  </Pressable>
                </View>
              )}
            />
          )}
        </>
      )}

      <BottomSheet visible={editorOpen} onClose={closeEditor} sheetStyle={styles.sheetSurface}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{editing ? 'Edit quick reply' : 'Create quick reply'}</Text>
            </View>

            <SheetScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
            >
              <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                value={form.title}
                onChangeText={(title) => setForm((current) => ({ ...current, title }))}
                placeholder="Greeting"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.cardBorder, color: colors.text }]}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>Channels</Text>
              <Text style={[styles.helpText, { color: colors.textMuted }]}>
                Leave empty to make this quick reply available globally. Select one or more channel accounts to target it.
              </Text>
              <Pressable
                onPress={() => setChannelPickerOpen(true)}
                disabled={channelsQuery.isLoading || channelAccountOptions.length === 0}
                style={[styles.select, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}
              >
                <Text
                  style={[
                    styles.selectText,
                    { color: form.channelAccountIds.length ? colors.text : colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {channelsQuery.isLoading
                    ? 'Loading channel accounts...'
                    : channelsQuery.isError
                      ? 'Could not load channels'
                      : channelAccountOptions.length === 0
                        ? 'No connected channel accounts found'
                        : form.channelAccountIds.length === 0
                          ? 'Select channel accounts'
                          : `${form.channelAccountIds.length} channel account${form.channelAccountIds.length === 1 ? '' : 's'} selected`}
                </Text>
                <ChevronDown color={colors.textMuted} size={18} />
              </Pressable>
              {selectedChannelAccounts.length > 0 ? (
                <View style={styles.chipWrap}>
                  {selectedChannelAccounts.map((account) => (
                    <Pressable
                      key={account.id}
                      onPress={() => setForm((current) => ({
                        ...current,
                        channelAccountIds: current.channelAccountIds.filter((id) => id !== account.id),
                      }))}
                      style={[styles.selectedChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
                    >
                      <Text style={[styles.selectedChipText, { color: colors.text }]} numberOfLines={1}>{account.label}</Text>
                      <X color={colors.textMuted} size={12} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={[styles.channelStatus, { color: colors.primary }]}>Global quick reply</Text>
              )}

              <View style={styles.labelRow}>
                <Text style={[styles.labelInline, { color: colors.textSecondary }]}>Message</Text>
                <Pressable style={styles.variableChip} onPress={insertNameVariable}>
                  <Plus color={colors.primary} size={12} />
                  <Text style={[styles.variableChipText, { color: colors.primary }]}>{'{{name}}'}</Text>
                </Pressable>
              </View>
              <TextInput
                value={form.body}
                onChangeText={(body) => setForm((current) => ({ ...current, body }))}
                placeholder="Hi {{name}}, thanks for reaching out..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.cardBorder, color: colors.text }]}
                multiline
                textAlignVertical="top"
              />
              {unsupportedVars.length > 0 ? (
                <Text style={styles.errorText}>Unsupported: {unsupportedVars.join(', ')}. Only {'{{name}}'} is supported.</Text>
              ) : null}

              <Text style={[styles.label, { color: colors.textSecondary }]}>Attachments</Text>
              <View style={styles.attachActions}>
                <Pressable style={styles.secondaryButton} onPress={() => void pickAttachments('image')} disabled={uploading}>
                  <Paperclip color={colors.primary} size={16} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Photos</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void pickAttachments('document')} disabled={uploading}>
                  <Paperclip color={colors.primary} size={16} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Files</Text>
                </Pressable>
              </View>
              {uploading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} /> : null}
              {form.attachments.map((attachment) => {
                const previewUrl = quickReplyAttachmentPreviewUrl(attachment);
                const showImage = Boolean(previewUrl) && isQuickReplyImageAttachment(attachment);
                return (
                  <View key={attachment.id} style={[styles.attachmentRow, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                    {showImage ? (
                      <AuthenticatedImage url={previewUrl} style={styles.attachmentThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.attachmentThumb, styles.attachmentThumbFallback, { backgroundColor: colors.surfaceSecondary }]}>
                        <Paperclip color={colors.textMuted} size={14} />
                      </View>
                    )}
                    <Text style={[styles.attachmentName, { color: colors.textSecondary }]} numberOfLines={1}>
                      {attachment.originalName || attachment.id}
                    </Text>
                    <Pressable onPress={() => removeAttachment(attachment.id)} hitSlop={8}>
                      <X color="#e11d48" size={16} />
                    </Pressable>
                  </View>
                );
              })}

              <Text style={[styles.label, { color: colors.textSecondary }]}>Preview</Text>
              <View style={[styles.previewCard, { backgroundColor: colors.primary }]}>
                <Text style={styles.previewBubbleText}>{previewText || 'Your message preview will appear here.'}</Text>
                {form.attachments.filter(isQuickReplyImageAttachment).slice(0, 4).map((attachment) => {
                  const previewUrl = quickReplyAttachmentPreviewUrl(attachment);
                  if (!previewUrl) return null;
                  return (
                    <AuthenticatedImage
                      key={attachment.id}
                      url={previewUrl}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                  );
                })}
              </View>
            </SheetScrollView>

            <AppButton
              block
              style={styles.primaryButtonSpacing}
              label={editing ? 'Save changes' : 'Create quick reply'}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={savingDisabled}
              onPress={() => void handleSave()}
            />
        </BottomSheet>
      <BottomSheet
        visible={channelPickerOpen}
        onClose={() => setChannelPickerOpen(false)}
        sheetStyle={styles.sheetSurface}
      >
        <Text style={[styles.sheetTitle, { color: colors.text }]}>Select channel accounts</Text>
        <TextInput
          value={channelSearch}
          onChangeText={setChannelSearch}
          placeholder="Search channel accounts"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { backgroundColor: colors.background, borderColor: colors.cardBorder, color: colors.text, marginTop: 12 }]}
        />
        <SheetFlatList
          data={visibleChannelAccounts}
          keyExtractor={(item) => item.id}
          style={styles.channelList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={(
            <Text style={[styles.helpText, { color: colors.textMuted, marginTop: 16 }]}>
              {channelAccountOptions.length === 0 ? 'No connected channel accounts found' : 'No matching channel accounts'}
            </Text>
          )}
          renderItem={({ item }) => {
            const selected = form.channelAccountIds.includes(item.id);
            return (
              <Pressable
                onPress={() => setForm((current) => ({
                  ...current,
                  channelAccountIds: selected
                    ? current.channelAccountIds.filter((id) => id !== item.id)
                    : [...current.channelAccountIds, item.id],
                }))}
                style={[styles.channelRow, { backgroundColor: selected ? colors.surfaceSecondary : colors.background, borderColor: selected ? colors.primary : colors.cardBorder }]}
              >
                <View style={styles.channelCopy}>
                  <Text style={[styles.channelLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
                  <Text style={[styles.channelMeta, { color: colors.textMuted }]} numberOfLines={1}>{item.description}</Text>
                </View>
                {selected ? <Check color={colors.primary} size={16} /> : null}
              </Pressable>
            );
          }}
        />
        <AppButton
          block
          style={styles.primaryButtonSpacing}
          label="Done"
          onPress={() => setChannelPickerOpen(false)}
        />
      </BottomSheet>
      <ConfirmDialog
        visible={Boolean(pendingDelete)}
        title="Delete quick reply"
        body={pendingDelete ? `Delete “${pendingDelete.title}”? This cannot be undone.` : ''}
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          void deleteMutation.mutateAsync({ id: pendingDelete.id }).then(
            () => setPendingDelete(null),
            (error: Error) => Toast.show({ type: 'error', text1: 'Could not delete', text2: error.message }),
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  addButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  loader: { marginTop: 60 },
  searchWrap: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  listContent: { gap: 10, padding: 16 },
  emptyCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, padding: 28 },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyBody: { fontSize: 13, marginBottom: 16, marginTop: 4, textAlign: 'center' },
  itemCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  itemIcon: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 15, fontWeight: '700' },
  itemBody: { fontSize: 12, marginTop: 2 },
  itemMeta: { fontSize: 11, marginTop: 4 },
  iconButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  primaryButtonSpacing: { marginTop: 12 },
  disabled: { opacity: 0.55 },
  sheetOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheetSurface: { maxHeight: '100%', paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetScroll: { flexGrow: 1, flexShrink: 1 },
  sheetContent: { paddingBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  labelInline: { fontSize: 12, fontWeight: '700' },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, marginTop: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  textArea: { minHeight: 110 },
  variableChip: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  variableChipText: { fontSize: 12, fontWeight: '700' },
  helpText: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  select: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  selectText: { flex: 1, fontSize: 14, marginRight: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  selectedChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6 },
  selectedChipText: { flexShrink: 1, fontSize: 12, fontWeight: '600' },
  channelList: { flexGrow: 0, marginTop: 8, maxHeight: 360 },
  channelRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10 },
  channelCopy: { flex: 1, minWidth: 0 },
  channelLabel: { fontSize: 14, fontWeight: '700' },
  channelMeta: { fontSize: 11, marginTop: 2 },
  channelStatus: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  errorText: { color: '#e11d48', fontSize: 12, marginTop: 6 },
  attachActions: { flexDirection: 'row', gap: 10 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  attachmentRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 10, paddingVertical: 8 },
  attachmentThumb: { borderRadius: 8, height: 44, marginRight: 10, width: 44 },
  attachmentThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  attachmentName: { flex: 1, fontSize: 13, marginRight: 8 },
  previewCard: { borderRadius: 18, marginBottom: 4, padding: 14 },
  previewBubbleText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  previewImage: { borderRadius: 12, height: 140, marginTop: 10, width: '100%' },
  previewText: { fontSize: 14, lineHeight: 20 },
});
