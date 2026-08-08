// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, Unlink } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  createWhatsappTemplate,
  deleteWhatsappTemplate,
  fetchWhatsappTemplates,
  syncWhatsappTemplates,
  unlinkWhatsappTemplate,
  updateWhatsappTemplate,
  type WhatsappTemplate,
  type WhatsappTemplateCategory,
  type WhatsappTemplateFormValues,
  type WhatsappTemplateStatus,
} from '../api/whatsappTemplates';
import { formatTemplateUpdatedAt, makeDraftTemplate, mapTemplateToForm } from '../lib/whatsapp-template-utils';
import { WhatsappTemplateSheet, type TemplateSheetMode } from './WhatsappTemplateSheet';

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  APPROVED: { bg: '#e8fbf3', fg: '#047857' },
  PENDING: { bg: '#fff7df', fg: '#b45309' },
  PROCESSING: { bg: '#fff7df', fg: '#b45309' },
  FAILED: { bg: '#ffe4e6', fg: '#be123c' },
  REJECTED: { bg: '#ffe4e6', fg: '#be123c' },
  DELETED: { bg: '#f1f5f9', fg: '#64748b' },
  PAUSED: { bg: '#ffedd5', fg: '#c2410c' },
  DRAFT: { bg: '#f1f5f9', fg: '#64748b' },
};

const STATUS_FILTERS: Array<{ id: WhatsappTemplateStatus | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'REJECTED', label: 'Rejected' },
];

const CATEGORY_FILTERS: Array<{ id: WhatsappTemplateCategory | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All categories' },
  { id: 'MARKETING', label: 'Marketing' },
  { id: 'UTILITY', label: 'Utility' },
  { id: 'AUTHENTICATION', label: 'Authentication' },
];

type SheetState =
  | { mode: 'view'; template: WhatsappTemplate }
  | { mode: 'edit'; template: WhatsappTemplate; form: WhatsappTemplateFormValues }
  | { mode: 'create'; form: WhatsappTemplateFormValues }
  | null;

export function WhatsappTemplatesTab({ channelId }: { channelId: string }) {
  const queryClient = useQueryClient();
  const templates = useQuery({
    queryKey: ['whatsapp-templates', channelId],
    queryFn: () => fetchWhatsappTemplates(channelId),
    staleTime: 30000,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WhatsappTemplateStatus | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<WhatsappTemplateCategory | 'ALL'>('ALL');
  const [sheet, setSheet] = useState<SheetState>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['whatsapp-templates', channelId] });
    queryClient.invalidateQueries({ queryKey: ['channel-details', channelId] });
  };

  const sync = useMutation({
    mutationFn: () => syncWhatsappTemplates(channelId),
    onSuccess: (result) => {
      invalidate();
      Alert.alert('Templates synced', `Synced ${result.fetchedCount} templates from Meta (${result.approvedCount} approved, ${result.rejectedCount} rejected).`);
    },
    onError: (error) => Alert.alert('Sync failed', error instanceof Error ? error.message : undefined),
  });

  const del = useMutation({
    mutationFn: ({ templateId }: { templateId: string }) => deleteWhatsappTemplate(channelId, templateId),
    onSuccess: () => {
      invalidate();
      Alert.alert('Template deleted', 'The template was deleted.');
    },
    onError: (error) => Alert.alert('Delete failed', error instanceof Error ? error.message : undefined),
  });

  const unlink = useMutation({
    mutationFn: ({ templateId }: { templateId: string }) => unlinkWhatsappTemplate(channelId, templateId),
    onSuccess: () => {
      invalidate();
      Alert.alert('Template unlinked', 'The template was unlinked from this workspace.');
    },
    onError: (error) => Alert.alert('Unlink failed', error instanceof Error ? error.message : undefined),
  });

  const save = useMutation({
    mutationFn: (form: WhatsappTemplateFormValues) => {
      if (sheet?.mode === 'edit') return updateWhatsappTemplate(channelId, sheet.template.id, form);
      return createWhatsappTemplate(channelId, form);
    },
    onSuccess: (_data, _vars, _ctx) => {
      const wasCreate = sheet?.mode === 'create';
      invalidate();
      setSheet(null);
      Alert.alert(
        wasCreate ? 'Template submitted' : 'Template updated',
        wasCreate ? 'Your template was submitted to WhatsApp for review.' : 'Your template changes were submitted.',
      );
    },
    onError: (error) => Alert.alert('Save failed', error instanceof Error ? error.message : undefined),
  });

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (templates.data?.items ?? []).filter((template) => {
      if (statusFilter !== 'ALL') {
        const normalized = template.status === 'PROCESSING' ? 'PENDING' : template.status;
        if (statusFilter === 'PENDING') {
          if (normalized !== 'PENDING' && template.status !== 'PROCESSING') return false;
        } else if (template.status !== statusFilter) {
          return false;
        }
      }
      if (categoryFilter !== 'ALL' && template.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        template.name.toLowerCase().includes(query)
        || template.body.toLowerCase().includes(query)
        || (template.header?.content ?? '').toLowerCase().includes(query)
      );
    });
  }, [templates.data?.items, search, statusFilter, categoryFilter]);

  const confirmDelete = (template: WhatsappTemplate) => {
    Alert.alert('Delete template?', `"${template.name}" will be deleted from Meta and this workspace.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate({ templateId: template.id }) },
    ]);
  };

  const confirmUnlink = (template: WhatsappTemplate) => {
    Alert.alert('Unlink template?', `"${template.name}" will be removed from this workspace but kept in Meta.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => unlink.mutate({ templateId: template.id }) },
    ]);
  };

  const sheetMode: TemplateSheetMode = sheet?.mode ?? 'view';

  const filtersActive = search.trim().length > 0 || statusFilter !== 'ALL' || categoryFilter !== 'ALL';

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <View style={styles.toolbar}>
          <Pressable style={[styles.syncButton, sync.isPending && styles.buttonDisabled]} onPress={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <LoaderCircle color="#315efb" size={15} /> : <RefreshCw color="#315efb" size={15} />}
            <Text style={styles.syncText}>Sync</Text>
          </Pressable>
          <Pressable style={styles.newButton} onPress={() => setSheet({ mode: 'create', form: makeDraftTemplate() })}>
            <Plus color="#fff" size={16} />
            <Text style={styles.newButtonText}>New template</Text>
          </Pressable>
        </View>

        <View style={styles.search}>
          <Search color="#94a3b8" size={16} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search templates…"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Text style={styles.clearSearch}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>Status</Text>
          <View style={styles.statusSegment}>
            {STATUS_FILTERS.map((filter) => {
              const active = statusFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  style={[styles.statusOption, active && styles.statusOptionActive]}
                  onPress={() => setStatusFilter(filter.id)}
                >
                  <Text style={[styles.statusOptionText, active && styles.statusOptionTextActive]} numberOfLines={1}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>Category</Text>
          <View style={styles.categoryWrap}>
            {CATEGORY_FILTERS.map((filter) => {
              const active = categoryFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setCategoryFilter(filter.id)}
                >
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]} numberOfLines={1}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {filtersActive ? (
          <Pressable
            style={styles.resetFilters}
            onPress={() => {
              setSearch('');
              setStatusFilter('ALL');
              setCategoryFilter('ALL');
            }}
          >
            <Text style={styles.resetFiltersText}>Reset filters</Text>
          </Pressable>
        ) : null}
      </View>

      {templates.isLoading ? (
        <ActivityIndicator color="#2563eb" style={{ marginTop: 40 }} />
      ) : templates.isError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Could not load templates</Text>
          <Text style={styles.emptyText}>{templates.error instanceof Error ? templates.error.message : 'Please try again.'}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <FileText color="#94a3b8" size={30} />
          <Text style={styles.emptyTitle}>No templates found</Text>
          <Text style={styles.emptyText}>
            {search || statusFilter !== 'ALL' || categoryFilter !== 'ALL'
              ? 'Try adjusting filters or search.'
              : 'Create a template or sync with Meta to pull existing ones.'}
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
          {items.map((template) => {
            const tone = STATUS_TONE[template.status] ?? STATUS_TONE.DRAFT;
            return (
              <View key={template.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardName} numberOfLines={1}>{template.name}</Text>
                    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.badgeText, { color: tone.fg }]}>{template.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>
                    {template.category} · {template.language} · Updated {formatTemplateUpdatedAt(template.updatedAt)}
                  </Text>
                </View>
                <Text style={styles.cardBody} numberOfLines={2}>{template.body || 'No body content'}</Text>
                {template.rejectionReason ? <Text style={styles.rejection} numberOfLines={2}>Rejected: {template.rejectionReason}</Text> : null}
                <View style={styles.cardActions}>
                  <Pressable style={styles.actionButton} onPress={() => setSheet({ mode: 'view', template })}>
                    <Eye color="#2563eb" size={14} />
                    <Text style={styles.actionText}>View</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => setSheet({ mode: 'edit', template, form: mapTemplateToForm(template) })}
                  >
                    <Pencil color="#2563eb" size={14} />
                    <Text style={styles.actionText}>Edit</Text>
                  </Pressable>
                  {template.source === 'remote' ? (
                    <Pressable style={styles.actionButton} onPress={() => confirmUnlink(template)}>
                      <Unlink color="#dc2626" size={14} />
                      <Text style={[styles.actionText, { color: '#dc2626' }]}>Unlink</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.actionButton} onPress={() => confirmDelete(template)}>
                      <Trash2 color="#dc2626" size={14} />
                      <Text style={[styles.actionText, { color: '#dc2626' }]}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <WhatsappTemplateSheet
        visible={Boolean(sheet)}
        mode={sheetMode}
        template={sheet && sheet.mode !== 'create' ? sheet.template : null}
        initialForm={sheet?.mode === 'create' || sheet?.mode === 'edit' ? sheet.form : null}
        isSaving={save.isPending}
        onClose={() => setSheet(null)}
        onEdit={() => {
          if (sheet?.mode === 'view') {
            setSheet({ mode: 'edit', template: sheet.template, form: mapTemplateToForm(sheet.template) });
          }
        }}
        onSave={(form) => save.mutate(form)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f4f7fb', flex: 1 },
  controls: {
    backgroundColor: '#fff',
    borderBottomColor: '#e8eef7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  toolbar: { flexDirection: 'row', gap: 10 },
  syncButton: {
    alignItems: 'center',
    backgroundColor: '#fff9ef',
    borderColor: '#f3e0b8',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  syncText: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  newButton: {
    alignItems: 'center',
    backgroundColor: '#315efb',
    borderRadius: 999,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  newButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },
  search: {
    alignItems: 'center',
    backgroundColor: '#fff9ef',
    borderColor: '#cfe1ff',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 14,
  },
  searchInput: { color: '#0f172a', flex: 1, fontSize: 14, height: 44, marginLeft: 8 },
  clearSearch: { color: '#315efb', fontSize: 12, fontWeight: '700', paddingHorizontal: 4 },
  filterBlock: { gap: 8 },
  filterLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusSegment: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  statusOption: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 9,
  },
  statusOptionActive: {
    backgroundColor: '#315efb',
  },
  statusOptionText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  statusOptionTextActive: { color: '#fff', fontWeight: '700' },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    backgroundColor: '#fff',
    borderColor: '#cfe1ff',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  categoryChipActive: { backgroundColor: '#315efb', borderColor: '#315efb' },
  categoryChipText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  categoryChipTextActive: { color: '#fff', fontWeight: '700' },
  resetFilters: { alignSelf: 'flex-start', paddingVertical: 2 },
  resetFiltersText: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  list: { gap: 12, padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, padding: 14 },
  cardHead: { borderBottomColor: '#e8eef7', borderBottomWidth: 1, paddingBottom: 10 },
  cardTitleWrap: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  cardName: { color: '#0f172a', flexShrink: 1, fontSize: 15, fontWeight: '700' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cardMeta: { color: '#64748b', fontSize: 12, marginTop: 4 },
  cardBody: { color: '#475569', fontSize: 13, lineHeight: 19, marginTop: 10 },
  rejection: { color: '#be123c', fontSize: 12, marginTop: 6 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionButton: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingRight: 10, paddingVertical: 6 },
  actionText: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptyText: { color: '#64748b', fontSize: 13, marginTop: 5, textAlign: 'center' },
});
