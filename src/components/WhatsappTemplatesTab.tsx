// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, Unlink } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
} from '../api/whatsappTemplates';

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  APPROVED: { bg: '#e8fbf3', fg: '#047857' },
  PENDING: { bg: '#fff7df', fg: '#b45309' },
  PROCESSING: { bg: '#fff7df', fg: '#b45309' },
  FAILED: { bg: '#ffe4e6', fg: '#be123c' },
  REJECTED: { bg: '#ffe4e6', fg: '#be123c' },
  DELETED: { bg: '#ffe4e6', fg: '#be123c' },
  PAUSED: { bg: '#f1f5f9', fg: '#64748b' },
  DRAFT: { bg: '#f1f5f9', fg: '#64748b' },
};

const CATEGORIES: Array<{ value: WhatsappTemplateCategory; label: string }> = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'UTILITY', label: 'Utility' },
  { value: 'AUTHENTICATION', label: 'Authentication' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
  { value: 'pt_BR', label: 'Portuguese (Brazil)' },
];

function emptyForm(): WhatsappTemplateFormValues {
  return { name: '', language: 'en', category: 'MARKETING', header: { enabled: false, type: 'TEXT', content: '' }, body: '', footer: '', buttons: [], variables: [] };
}

function toForm(template: WhatsappTemplate): WhatsappTemplateFormValues {
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    header: { enabled: template.header?.enabled ?? false, type: template.header?.type === 'NONE' ? 'TEXT' : template.header?.type ?? 'TEXT', content: template.header?.content ?? '' },
    body: template.body,
    footer: template.footer,
    buttons: template.buttons ?? [],
    variables: template.variables ?? [],
  };
}

export function WhatsappTemplatesTab({ channelId }: { channelId: string }) {
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ['whatsapp-templates', channelId], queryFn: () => fetchWhatsappTemplates(channelId), staleTime: 30000 });

  const [editor, setEditor] = useState<{ templateId: string | null; form: WhatsappTemplateFormValues } | null>(null);

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
    mutationFn: (form: WhatsappTemplateFormValues) =>
      editor?.templateId ? updateWhatsappTemplate(channelId, editor.templateId, form) : createWhatsappTemplate(channelId, form),
    onSuccess: () => {
      invalidate();
      setEditor(null);
      Alert.alert('Template saved', 'Your template was submitted to WhatsApp for review.');
    },
    onError: (error) => Alert.alert('Save failed', error instanceof Error ? error.message : undefined),
  });

  const confirmDelete = (template: WhatsappTemplate) => {
    Alert.alert('Delete template?', `"${template.name}" will be deleted. This cannot be undone.`, [
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

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Pressable style={[styles.syncButton, sync.isPending && styles.buttonDisabled]} onPress={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? <LoaderCircle color="#315efb" size={15} /> : <RefreshCw color="#315efb" size={15} />}
          <Text style={styles.syncText}>Sync with Meta</Text>
        </Pressable>
        <Pressable style={styles.newButton} onPress={() => setEditor({ templateId: null, form: emptyForm() })}>
          <Plus color="#fff" size={16} />
          <Text style={styles.newButtonText}>New template</Text>
        </Pressable>
      </View>

      {templates.isLoading ? (
        <ActivityIndicator color="#2563eb" style={{ marginTop: 40 }} />
      ) : templates.isError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Could not load templates</Text>
          <Text style={styles.emptyText}>{templates.error instanceof Error ? templates.error.message : 'Please try again.'}</Text>
        </View>
      ) : templates.data && templates.data.items.length === 0 ? (
        <View style={styles.empty}>
          <FileText color="#94a3b8" size={30} />
          <Text style={styles.emptyTitle}>No templates yet</Text>
          <Text style={styles.emptyText}>Create a template or sync with Meta to pull existing ones.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
          {(templates.data?.items ?? []).map((template) => {
            const tone = STATUS_TONE[template.status] ?? STATUS_TONE.DRAFT;
            return (
              <View key={template.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardName} numberOfLines={1}>{template.name}</Text>
                    <View style={[styles.badge, { backgroundColor: tone.bg }]}><Text style={[styles.badgeText, { color: tone.fg }]}>{template.status}</Text></View>
                  </View>
                  <Text style={styles.cardMeta}>{template.category} · {template.language}</Text>
                </View>
                <Text style={styles.cardBody} numberOfLines={2}>{template.body || 'No body content'}</Text>
                {template.rejectionReason ? <Text style={styles.rejection} numberOfLines={2}>Rejected: {template.rejectionReason}</Text> : null}
                <View style={styles.cardActions}>
                  <Pressable style={styles.actionButton} onPress={() => setEditor({ templateId: template.id, form: toForm(template) })}>
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

      <TemplateEditorModal editor={editor} onClose={() => setEditor(null)} onSave={(form) => save.mutate(form)} isSaving={save.isPending} />
    </View>
  );
}

function TemplateEditorModal({ editor, onClose, onSave, isSaving }: { editor: { templateId: string | null; form: WhatsappTemplateFormValues } | null; onClose: () => void; onSave: (form: WhatsappTemplateFormValues) => void; isSaving: boolean }) {
  const [form, setForm] = useState<WhatsappTemplateFormValues | null>(null);
  const [openedKey, setOpenedKey] = useState<string | null>(null);

  if (!editor) {
    if (openedKey !== null) setOpenedKey(null);
    return null;
  }

  if (openedKey !== (editor.templateId ?? 'new')) {
    setForm({ ...editor.form, header: { ...editor.form.header }, buttons: [...editor.form.buttons], variables: [...editor.form.variables] });
    setOpenedKey(editor.templateId ?? 'new');
  }

  if (!form) return null;

  const set = (patch: Partial<WhatsappTemplateFormValues>) => setForm({ ...form, ...patch });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <Text style={styles.modalTitle}>{editor.templateId ? 'Edit template' : 'New template'}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput value={form.name} onChangeText={(text) => set({ name: text })} placeholder="order_confirmation" placeholderTextColor="#94a3b8" style={styles.input} />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.segment}>
              {CATEGORIES.map((option) => (
                <Pressable key={option.value} onPress={() => set({ category: option.value })} style={[styles.segmentOption, form.category === option.value && styles.segmentOptionActive]}>
                  <Text style={[styles.segmentText, form.category === option.value && styles.segmentTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Language</Text>
            <View style={styles.languageWrap}>
              {LANGUAGES.map((lang) => (
                <Pressable key={lang.value} onPress={() => set({ language: lang.value })} style={[styles.languageChip, form.language === lang.value && styles.languageChipActive]}>
                  <Text style={[styles.languageText, form.language === lang.value && styles.languageTextActive]}>{lang.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Header (text)</Text>
              <Switch value={form.header.enabled} onValueChange={(value) => set({ header: { ...form.header, enabled: value } })} trackColor={{ true: '#2563eb' }} thumbColor="#fff" />
            </View>
            {form.header.enabled ? (
              <>
                <Text style={styles.fieldLabel}>Header text</Text>
                <TextInput value={form.header.content} onChangeText={(text) => set({ header: { ...form.header, content: text } })} placeholder="Your order {{1}} is confirmed" placeholderTextColor="#94a3b8" style={styles.input} />
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Body</Text>
            <TextInput value={form.body} onChangeText={(text) => set({ body: text })} placeholder="Hi {{1}}, your order is on the way." placeholderTextColor="#94a3b8" multiline style={styles.inputMultiline} />

            <Text style={styles.fieldLabel}>Footer</Text>
            <TextInput value={form.footer} onChangeText={(text) => set({ footer: text })} placeholder="Reply STOP to unsubscribe" placeholderTextColor="#94a3b8" style={styles.input} />
          </ScrollView>
          <Pressable style={[styles.saveButton, isSaving && styles.buttonDisabled]} onPress={() => onSave(form)} disabled={isSaving}>
            {isSaving ? <LoaderCircle color="#fff" size={16} /> : null}
            <Text style={styles.saveButtonText}>Save template</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14 },
  syncButton: { alignItems: 'center', backgroundColor: '#f6f9ff', borderColor: '#d8e6fb', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 9 },
  syncText: { color: '#315efb', fontSize: 13, fontWeight: '700' },
  newButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 9 },
  newButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },
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
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionButton: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingVertical: 6, paddingRight: 10 },
  actionText: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  emptyTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptyText: { color: '#64748b', fontSize: 13, marginTop: 5, textAlign: 'center' },
  modalBackdrop: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'center', padding: 20 },
  modalSheet: { backgroundColor: '#fff', borderRadius: 22, padding: 18 },
  modalTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  fieldLabel: { color: '#64748b', fontSize: 12, marginTop: 12 },
  input: { backgroundColor: '#f8fbff', borderColor: '#cfe1ff', borderRadius: 14, borderWidth: 1, color: '#0f172a', fontSize: 14, height: 46, marginTop: 6, paddingHorizontal: 14 },
  inputMultiline: { backgroundColor: '#f8fbff', borderColor: '#cfe1ff', borderRadius: 14, borderWidth: 1, color: '#0f172a', fontSize: 14, minHeight: 88, marginTop: 6, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top' },
  segment: { backgroundColor: '#eef2fb', borderRadius: 12, flexDirection: 'row', gap: 3, marginTop: 6, padding: 3 },
  segmentOption: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 8 },
  segmentOptionActive: { backgroundColor: '#fff' },
  segmentText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: '#2563eb' },
  languageWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  languageChip: { borderColor: '#cfe0fa', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  languageChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  languageText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  languageTextActive: { color: '#fff' },
  toggleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  toggleLabel: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  saveButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 16, paddingVertical: 12 },
  saveButtonText: { color: '#fff', flexShrink: 1, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
