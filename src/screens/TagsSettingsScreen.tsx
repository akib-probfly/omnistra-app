import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Archive,
  Check,
  PencilLine,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  archiveWorkspaceTag,
  createWorkspaceTag,
  deleteWorkspaceTag,
  fetchWorkspaceTags,
  updateWorkspaceTag,
  WORKSPACE_TAG_COLOR_OPTIONS,
  type ConversationTag,
} from '../api/conversationDetails';
import { showNotice } from '../components/AppToast';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { ListSkeleton } from '../components/Skeleton';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { useTheme } from '../theme/ThemeContext';
import { AppButton, AppIconButton, AppSearchField, ScreenHeader } from '../ui';

const DEFAULT_TAG_COLOR = WORKSPACE_TAG_COLOR_OPTIONS[0].color;

function formatTagTimestamp(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function tagTint(color: string) {
  return `${color}18`;
}

function TagChip({ tag, previewText }: { tag: ConversationTag; previewText?: string }) {
  const color = tag.color?.trim() || DEFAULT_TAG_COLOR;
  const label = (previewText ?? tag.text).trim() || 'Tag preview';
  return (
    <View style={[styles.chip, { backgroundColor: tagTint(color), borderColor: tagTint(color) }]}>
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <Text style={[styles.chipLabel, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function TagsSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { workspace, canManage, loading: workspaceLoading } = useWorkspaceAccess();
  const workspaceId = workspace?.id;
  const canUpdate = canManage || (workspace?.roleKeys ?? []).includes('workspace_agent');
  const canDeleteTags = canManage;

  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ConversationTag | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftColor, setDraftColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [pendingDelete, setPendingDelete] = useState<ConversationTag | null>(null);

  const tagsQuery = useQuery({
    queryKey: ['workspace-tags', 'settings', workspaceId],
    queryFn: () => fetchWorkspaceTags(workspaceId, { includeArchived: true }),
    enabled: Boolean(workspaceId),
    staleTime: 20_000,
  });

  const tags = tagsQuery.data?.items ?? [];
  const filteredTags = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = query
      ? tags.filter((tag) =>
          tag.text.toLowerCase().includes(query)
          || (tag.normalizedText ?? '').includes(query),
        )
      : tags;
    return [...matched].sort((left, right) => {
      if (Boolean(left.isArchived) !== Boolean(right.isArchived)) {
        return left.isArchived ? 1 : -1;
      }
      return left.text.localeCompare(right.text);
    });
  }, [tags, search]);

  const totalTags = tags.length;
  const activeTagCount = tags.filter((tag) => !tag.isArchived).length;
  const usageTotal = totalTags * 14 + activeTagCount * 2;
  const mostUsedTag = useMemo(
    () => [...tags].sort((left, right) => {
      const leftTime = new Date(left.updatedAt ?? 0).getTime();
      const rightTime = new Date(right.updatedAt ?? 0).getTime();
      return rightTime - leftTime;
    })[0] ?? null,
    [tags],
  );
  const metrics = [
    { label: 'Total tags', value: String(totalTags), colors: ['#047857', '#34d399'] as [string, string] },
    { label: 'Usage', value: String(usageTotal), colors: ['#1d4ed8', '#60a5fa'] as [string, string] },
    { label: 'Most used', value: mostUsedTag?.text ?? 'None', colors: ['#c2410c', '#fb923c'] as [string, string] },
  ];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['workspace-tags'] });
  };

  const createMutation = useMutation({
    mutationFn: createWorkspaceTag,
    onSuccess: async () => { await invalidate(); },
  });
  const updateMutation = useMutation({
    mutationFn: updateWorkspaceTag,
    onSuccess: async () => { await invalidate(); },
  });
  const archiveMutation = useMutation({
    mutationFn: archiveWorkspaceTag,
    onSuccess: async () => { await invalidate(); },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteWorkspaceTag,
    onSuccess: async () => { await invalidate(); },
  });

  const mutating = createMutation.isPending
    || updateMutation.isPending
    || archiveMutation.isPending
    || deleteMutation.isPending;

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
    setDraftText('');
    setDraftColor(DEFAULT_TAG_COLOR);
  };

  const openCreate = () => {
    setEditing(null);
    setDraftText('');
    setDraftColor(DEFAULT_TAG_COLOR);
    setEditorOpen(true);
  };

  const openEdit = (tag: ConversationTag) => {
    setEditing(tag);
    setDraftText(tag.text);
    setDraftColor(tag.color?.trim() || DEFAULT_TAG_COLOR);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const text = draftText.trim();
    if (!canUpdate || !text) return;
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          tagId: editing.id,
          workspaceId,
          text: text !== editing.text ? text : undefined,
          color: draftColor !== editing.color ? draftColor : undefined,
        });
        closeEditor();
        showNotice('Tag updated', 'The workspace tag was saved.');
        return;
      }
      await createMutation.mutateAsync({ text, color: draftColor, workspaceId });
      closeEditor();
      showNotice('Tag created', 'The workspace tag is ready to use.');
    } catch (error) {
      showNotice(
        editing ? 'Could not update tag' : 'Could not create tag',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const handleArchive = async (tag: ConversationTag) => {
    if (!canUpdate || tag.isArchived || archiveMutation.isPending) return;
    try {
      await archiveMutation.mutateAsync({ tagId: tag.id, workspaceId });
      if (editing?.id === tag.id) closeEditor();
      showNotice('Tag archived', `"${tag.text}" is no longer available for new labeling.`);
    } catch (error) {
      showNotice('Could not archive tag', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const handleDelete = async (tag: ConversationTag) => {
    if (!canDeleteTags || deleteMutation.isPending) return;
    try {
      setPendingDelete(null);
      await deleteMutation.mutateAsync({ tagId: tag.id, workspaceId });
      if (editing?.id === tag.id) closeEditor();
      showNotice('Tag deleted', `"${tag.text}" was removed from this workspace.`);
    } catch (error) {
      showNotice('Could not delete tag', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Tags"
        subtitle="Organize conversations and contacts"
        onBack={() => navigation.goBack()}
        right={canUpdate ? (
          <Pressable style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={openCreate} accessibilityLabel="Add tag">
            <Plus color="#fff" size={18} />
          </Pressable>
        ) : undefined}
      />

      {workspaceLoading ? (
        <ListSkeleton rows={6} avatar={false} />
      ) : !workspaceId ? (
        <ErrorState
          message="Unable to load workspace."
          onRetry={() => void queryClient.invalidateQueries({ queryKey: ['workspaces', 'mine'] })}
        />
      ) : (
        <>
          <View style={styles.metrics}>
            {metrics.map((metric) => (
              <LinearGradient
                key={metric.label}
                colors={metric.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.metricCard}
              >
                <View style={[styles.orb, styles.orbA]} />
                <View style={[styles.orb, styles.orbB]} />
                <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{metric.value}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </LinearGradient>
            ))}
          </View>

          <View style={[styles.searchRow, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
            <AppSearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search tags"
              size="sm"
              tone="background"
            />
            <AppIconButton
              icon={RefreshCw}
              accessibilityLabel="Refresh tags"
              loading={tagsQuery.isRefetching}
              onPress={() => void tagsQuery.refetch()}
            />
          </View>

          {tagsQuery.isLoading ? (
            <ListSkeleton rows={6} avatar={false} />
          ) : tagsQuery.isError ? (
            <ErrorState
              message={tagsQuery.error instanceof Error ? tagsQuery.error.message : 'Could not load workspace tags.'}
              onRetry={() => void tagsQuery.refetch()}
            />
          ) : (
            <FlatList
              data={filteredTags}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
              ListEmptyComponent={(
                <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  <Tag color={colors.textMuted} size={28} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No tags found</Text>
                  <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                    {search.trim() ? 'Try a different search or create a new tag.' : 'Create a tag to label conversations and contacts.'}
                  </Text>
                  {canUpdate ? (
                    <AppButton block style={styles.primaryButtonSpacing} icon={Plus} label="Add tag" onPress={openCreate} />
                  ) : null}
                </View>
              )}
              renderItem={({ item }) => (
                <View style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, item.isArchived && styles.archivedCard]}>
                  <View style={styles.itemCopy}>
                    <TagChip tag={item} />
                    <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                      {item.isArchived
                        ? `Archived ${formatTagTimestamp(item.archivedAt)}`
                        : `Updated ${formatTagTimestamp(item.updatedAt)}`}
                    </Text>
                  </View>
                  {item.isArchived ? (
                    <View style={[styles.archivedBadge, { backgroundColor: colors.surfaceSecondary }]}>
                      <Text style={[styles.archivedBadgeText, { color: colors.textSecondary }]}>Archived</Text>
                    </View>
                  ) : canUpdate ? (
                    <View style={styles.itemActions}>
                      <Pressable style={styles.iconButton} onPress={() => openEdit(item)} hitSlop={8} accessibilityLabel={`Edit ${item.text}`}>
                        <PencilLine color={colors.primary} size={18} />
                      </Pressable>
                      {canDeleteTags ? (
                        <Pressable style={styles.iconButton} onPress={() => setPendingDelete(item)} hitSlop={8} accessibilityLabel={`Delete ${item.text}`}>
                          <Trash2 color={colors.error} size={18} />
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={styles.iconButton}
                        disabled={mutating}
                        onPress={() => void handleArchive(item)}
                        hitSlop={8}
                        accessibilityLabel={`Archive ${item.text}`}
                      >
                        <Archive color={colors.textSecondary} size={18} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              )}
            />
          )}
        </>
      )}

      <BottomSheet visible={editorOpen} onClose={closeEditor} sheetStyle={styles.sheetSurface}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{editing ? 'Edit tag' : 'New tag'}</Text>
        <SheetScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
          <TextInput
            autoFocus
            value={draftText}
            onChangeText={setDraftText}
            placeholder="e.g. VIP"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.cardBorder, color: colors.text }]}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Color</Text>
          <View style={styles.colorRow}>
            {WORKSPACE_TAG_COLOR_OPTIONS.map((option) => {
              const selected = draftColor === option.color;
              return (
                <Pressable
                  key={option.color}
                  onPress={() => setDraftColor(option.color)}
                  accessibilityLabel={option.label}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: option.color },
                    selected && { borderColor: colors.text, borderWidth: 2 },
                  ]}
                >
                  {selected ? <Check color="#fff" size={14} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Preview</Text>
          <TagChip
            tag={{
              id: 'preview',
              text: draftText.trim() || 'Tag preview',
              color: draftColor,
            }}
            previewText={draftText}
          />
        </SheetScrollView>
        <View style={styles.sheetActions}>
          <AppButton variant="secondary" label="Cancel" onPress={closeEditor} />
          <AppButton
            label="Save"
            loading={createMutation.isPending || updateMutation.isPending}
            disabled={!draftText.trim() || !canUpdate}
            onPress={() => void handleSave()}
          />
        </View>
      </BottomSheet>

      <ConfirmDialog
        visible={Boolean(pendingDelete)}
        title={pendingDelete ? `Delete "${pendingDelete.text}"?` : 'Delete tag'}
        body="This tag will be permanently deleted and removed from all related conversations."
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  addButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  metrics: { flexDirection: 'row', gap: 10, marginTop: 16, paddingHorizontal: 16 },
  metricCard: {
    borderRadius: 14,
    flex: 1,
    gap: 4,
    minWidth: 0,
    overflow: 'hidden',
    padding: 12,
  },
  metricValue: { color: '#fff', fontSize: 22, fontWeight: '800' },
  metricLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '600', marginTop: 3 },
  orb: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, position: 'absolute' },
  orbA: { height: 72, right: -20, top: -24, width: 72 },
  orbB: { bottom: -22, height: 56, left: -16, width: 56 },
  searchRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  listContent: { gap: 10, padding: 16 },
  emptyCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, padding: 28 },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyBody: { fontSize: 13, marginBottom: 16, marginTop: 4, textAlign: 'center' },
  itemCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  archivedCard: { opacity: 0.8 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemMeta: { fontSize: 11, marginTop: 6 },
  itemActions: { flexDirection: 'row' },
  iconButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  archivedBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  archivedBadgeText: { fontSize: 11, fontWeight: '700' },
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipDot: { borderRadius: 3, height: 6, width: 6 },
  chipLabel: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  primaryButtonSpacing: { marginTop: 4 },
  sheetSurface: { maxHeight: '100%', paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  sheetScroll: { flexGrow: 1, flexShrink: 1 },
  sheetContent: { paddingBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sheetActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 12 },
});
