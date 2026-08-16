import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
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
  getUnsupportedQuickReplyVariables,
  renderQuickReplyPreview,
  updateQuickReply,
  uploadQuickReplyAttachment,
  type QuickReplyAttachment,
  type QuickReplySnippet,
} from '../api/quickReplies';
import { fetchMyWorkspaces } from '../api/workspaces';
import { ErrorState } from '../components/ErrorState';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { FormSkeleton, ListSkeleton } from '../components/Skeleton';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 100;

type FormState = {
  title: string;
  body: string;
  attachments: QuickReplyAttachment[];
};

function emptyForm(): FormState {
  return { title: '', body: '', attachments: [] };
}

function toForm(snippet: QuickReplySnippet | null): FormState {
  if (!snippet) return emptyForm();
  return {
    title: snippet.title ?? '',
    body: snippet.body ?? '',
    attachments: snippet.attachments ?? [],
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

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspaceId = workspacesQuery.data?.items?.[0]?.id;

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
    setNewAttachmentIds([]);
    setEditorOpen(true);
  };

  const openEdit = (snippet: QuickReplySnippet) => {
    setEditing(snippet);
    setForm(toForm(snippet));
    setNewAttachmentIds([]);
    setEditorOpen(true);
  };

  const cleanupNewAttachments = async (ids: string[]) => {
    await Promise.all(ids.map((id) => deleteWorkspaceFile(id).catch(() => undefined)));
  };

  const closeEditor = () => {
    const pending = newAttachmentIds;
    setEditorOpen(false);
    setEditing(null);
    setForm(emptyForm());
    setNewAttachmentIds([]);
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
        setNewAttachmentIds((current) => [...current, uploaded.id]);
        setForm((current) => ({
          ...current,
          attachments: [...current.attachments.filter((item) => item.id !== uploaded.id), uploaded],
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
      if (editing) {
        await updateMutation.mutateAsync({
          quickReplyId: editing.id,
          workspaceId,
          title,
          body,
          isActive: true,
          attachmentIds,
        });
      } else {
        await createMutation.mutateAsync({
          workspaceId,
          title,
          body,
          isActive: true,
          attachmentIds,
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
                    {(item.attachments?.length ?? 0) > 0 ? (
                      <Text style={[styles.itemMeta, { color: colors.textMuted }]}>{item.attachments.length} attachment{item.attachments.length === 1 ? '' : 's'}</Text>
                    ) : null}
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
              {form.attachments.map((attachment) => (
                <View key={attachment.id} style={[styles.attachmentRow, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.attachmentName, { color: colors.textSecondary }]} numberOfLines={1}>
                    {attachment.originalName || attachment.id}
                  </Text>
                  <Pressable onPress={() => removeAttachment(attachment.id)} hitSlop={8}>
                    <X color="#e11d48" size={16} />
                  </Pressable>
                </View>
              ))}

              <Text style={[styles.label, { color: colors.textSecondary }]}>Preview</Text>
              <View style={[styles.previewCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                <Text style={[styles.previewText, { color: colors.text }]}>{previewText || 'Your message preview will appear here.'}</Text>
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
  sheetSurface: { paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetScroll: { maxHeight: 420 },
  sheetContent: { paddingBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  labelInline: { fontSize: 12, fontWeight: '700' },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, marginTop: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  textArea: { minHeight: 110 },
  variableChip: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  variableChipText: { fontSize: 12, fontWeight: '700' },
  errorText: { color: '#e11d48', fontSize: 12, marginTop: 6 },
  attachActions: { flexDirection: 'row', gap: 10 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  attachmentRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 12, paddingVertical: 10 },
  attachmentName: { flex: 1, fontSize: 13, marginRight: 8 },
  previewCard: { borderRadius: 14, borderWidth: 1, marginBottom: 4, padding: 14 },
  previewText: { fontSize: 14, lineHeight: 20 },
});
