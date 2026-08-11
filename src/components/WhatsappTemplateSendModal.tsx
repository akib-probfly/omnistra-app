import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  PanelsTopLeft,
  Send,
  Upload,
  Video,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uploadFile } from '../api/client';
import type { WhatsappTemplate } from '../api/whatsappTemplates';
import {
  buildTemplateSendComponents,
  getTemplateButtonVariables,
  isMediaHeaderType,
  renderTemplateTextWithValues,
} from '../lib/whatsapp-template-send';
import { PanelSkeleton } from './Skeleton';

export type TemplateSendPayload = {
  templateName: string;
  templateCategory?: string | null;
  languageCode?: string;
  text?: string;
  templateComponents?: unknown[];
};

type HeaderMedia = {
  id: string;
  downloadUrl: string;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  originalName?: string | null;
};

type Props = {
  visible: boolean;
  templates: WhatsappTemplate[];
  loading?: boolean;
  error?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  workspaceId?: string;
  onClose: () => void;
  onSend: (payload: TemplateSendPayload) => void;
};

export function WhatsappTemplateSendModal({
  visible,
  templates,
  loading,
  error,
  query,
  onQueryChange,
  workspaceId,
  onClose,
  onSend,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsappTemplate | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [headerMedia, setHeaderMedia] = useState<HeaderMedia | null>(null);
  const [headerMediaError, setHeaderMediaError] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelectedTemplateId(null);
      setSelectedTemplate(null);
      setValues({});
      setHeaderMedia(null);
      setHeaderMediaError(null);
      setUploadingMedia(false);
      setSending(false);
    }
  }, [visible]);

  const activeTemplate = selectedTemplate
    ?? templates.find((template) => template.id === selectedTemplateId)
    ?? null;

  const activeHeaderMediaType =
    activeTemplate?.header?.enabled && isMediaHeaderType(activeTemplate.header.type)
      ? activeTemplate.header.type
      : null;

  const orderedVariables = useMemo(() => {
    if (!activeTemplate) return [];
    return [...(activeTemplate.variables ?? [])]
      .filter((variable) => variable.section !== 'BUTTON' && variable.index != null)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }, [activeTemplate]);

  const buttonVariables = useMemo(
    () => (activeTemplate ? getTemplateButtonVariables(activeTemplate) : []),
    [activeTemplate],
  );

  const requiredVariables = useMemo(
    () => [...orderedVariables, ...buttonVariables.map((item) => item.variable)],
    [orderedVariables, buttonVariables],
  );

  const missingRequiredVariable = requiredVariables.find(
    (variable) => variable.index != null && !values[variable.index]?.trim(),
  );

  const canSendTemplate =
    Boolean(activeTemplate)
    && !uploadingMedia
    && !sending
    && !missingRequiredVariable
    && (!activeHeaderMediaType || Boolean(headerMedia));

  function resetConfigureState() {
    setValues({});
    setHeaderMedia(null);
    setHeaderMediaError(null);
    setUploadingMedia(false);
    setSending(false);
  }

  function handleClose() {
    setSelectedTemplateId(null);
    resetConfigureState();
    onClose();
  }

  function handleSelectTemplate(template: WhatsappTemplate) {
    if (template.id !== selectedTemplateId) resetConfigureState();
    setSelectedTemplateId(template.id);
    setSelectedTemplate(template);
  }

  async function uploadHeaderMedia() {
    if (!activeHeaderMediaType) return;
    if (!workspaceId) {
      setHeaderMediaError('Workspace is not ready for media uploads yet.');
      return;
    }

    try {
      setHeaderMediaError(null);
      let picked: { uri: string; name: string; mimeType: string } | null = null;

      if (activeHeaderMediaType === 'IMAGE') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        picked = {
          uri: asset.uri,
          name: asset.fileName ?? `template-header-${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? 'image/jpeg',
        };
      } else if (activeHeaderMediaType === 'VIDEO') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['videos'],
          quality: 1,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        picked = {
          uri: asset.uri,
          name: asset.fileName ?? `template-header-${Date.now()}.mp4`,
          mimeType: asset.mimeType ?? 'video/mp4',
        };
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        picked = {
          uri: asset.uri,
          name: asset.name ?? `template-header-${Date.now()}.pdf`,
          mimeType: asset.mimeType ?? 'application/pdf',
        };
      }

      if (!picked) return;
      setUploadingMedia(true);
      const uploaded = await uploadFile('/files/upload', picked.uri, picked.name, picked.mimeType, {
        workspaceId,
      }) as any;
      const downloadUrl = uploaded.downloadUrl ?? uploaded.previewUrl ?? uploaded.thumbnailUrl;
      if (!downloadUrl) throw new Error('Upload succeeded but no media URL was returned.');
      setHeaderMedia({
        id: uploaded.id,
        downloadUrl,
        previewUrl: uploaded.previewUrl ?? null,
        thumbnailUrl: uploaded.thumbnailUrl ?? null,
        originalName: uploaded.originalName ?? picked.name,
      });
    } catch (uploadError) {
      setHeaderMediaError(
        uploadError instanceof Error ? uploadError.message : 'Could not upload header media.',
      );
    } finally {
      setUploadingMedia(false);
    }
  }

  function handleSend() {
    if (!activeTemplate || !canSendTemplate) return;
    setSending(true);
    const renderedBody = renderTemplateTextWithValues(
      activeTemplate.body ?? '',
      values,
      activeTemplate.variables,
    );
    onSend({
      templateName: activeTemplate.name,
      templateCategory: activeTemplate.category ?? null,
      languageCode: activeTemplate.language ?? 'en_US',
      text: renderedBody,
      templateComponents: buildTemplateSendComponents(activeTemplate, values, headerMedia),
    });
    handleClose();
  }

  const previewHeader = activeTemplate?.header?.enabled && activeTemplate.header.type === 'TEXT'
    ? renderTemplateTextWithValues(activeTemplate.header.content ?? '', values, activeTemplate.variables)
    : '';
  const previewBody = activeTemplate
    ? renderTemplateTextWithValues(activeTemplate.body ?? '', values, activeTemplate.variables)
    : '';
  const previewFooter = activeTemplate?.footer
    ? renderTemplateTextWithValues(activeTemplate.footer, values, activeTemplate.variables)
    : '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {selectedTemplateId == null || !activeTemplate ? (
            <View style={styles.panelBody}>
              <View style={styles.header}>
                <PanelsTopLeft color="#2563eb" size={16} />
                <Text style={styles.title}>WhatsApp templates</Text>
                <Pressable onPress={handleClose} style={styles.iconBtn} hitSlop={8}>
                  <X color="#64748b" size={20} />
                </Pressable>
              </View>
              <TextInput
                autoFocus
                placeholder="Search templates..."
                placeholderTextColor="#94a3b8"
                value={query}
                onChangeText={onQueryChange}
                style={styles.search}
              />
              {loading ? (
                <PanelSkeleton rows={4} />
              ) : error ? (
                <Text style={styles.errorText}>Could not load templates.</Text>
              ) : (
                <FlatList
                  data={templates}
                  keyExtractor={(item) => item.id}
                  style={styles.list}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={styles.errorText}>No approved templates found</Text>}
                  renderItem={({ item }) => (
                    <Pressable style={styles.row} onPress={() => handleSelectTemplate(item)}>
                      <View style={styles.nameRow}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                        {item.category ? (
                          <Text style={styles.category}>{String(item.category).toLowerCase()}</Text>
                        ) : null}
                      </View>
                      {item.body ? (
                        <Text numberOfLines={2} style={styles.rowBody}>
                          {renderTemplateTextWithValues(item.body, {}, item.variables)}
                        </Text>
                      ) : null}
                      {(item.variables?.length ?? 0) > 0 ? (
                        <Text style={styles.variableCount}>
                          {item.variables.length} variable{item.variables.length === 1 ? '' : 's'}
                        </Text>
                      ) : null}
                    </Pressable>
                  )}
                />
              )}
              <Text style={styles.hint}>Select a template, fill variables, then send</Text>
            </View>
          ) : (
            <View style={styles.panelBody}>
              <View style={styles.header}>
                <Pressable
                  onPress={() => {
                    setSelectedTemplateId(null);
                    setSelectedTemplate(null);
                    resetConfigureState();
                  }}
                  style={styles.iconBtn}
                  hitSlop={8}
                >
                  <ArrowLeft color="#334155" size={20} />
                </Pressable>
                <Text style={styles.title} numberOfLines={1}>
                  Template: {activeTemplate.name}
                </Text>
                <Pressable onPress={handleClose} style={styles.iconBtn} hitSlop={8}>
                  <X color="#64748b" size={20} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.configureScroll}
                contentContainerStyle={styles.configureContent}
                keyboardShouldPersistTaps="handled"
              >
                {requiredVariables.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Variables</Text>
                    {orderedVariables.map((variable) => (
                      <View key={`var-${variable.index}`} style={styles.field}>
                        <Text style={styles.fieldLabel}>{`{{${variable.index}}}`}</Text>
                        <TextInput
                          value={values[variable.index as number] ?? ''}
                          onChangeText={(text) => setValues((current) => ({
                            ...current,
                            [variable.index as number]: text,
                          }))}
                          placeholder={variable.sampleValue || `Value for {{${variable.index}}}`}
                          placeholderTextColor="#94a3b8"
                          style={styles.input}
                        />
                      </View>
                    ))}
                    {buttonVariables.map(({ buttonIndex, buttonLabel, variable }) => (
                      <View key={`btn-${buttonIndex}-${variable.index}`} style={styles.field}>
                        <Text style={styles.fieldLabel}>
                          {buttonLabel} {`{{${variable.index}}}`}
                        </Text>
                        <TextInput
                          value={values[variable.index as number] ?? ''}
                          onChangeText={(text) => setValues((current) => ({
                            ...current,
                            [variable.index as number]: text,
                          }))}
                          placeholder={variable.sampleValue || `Value for {{${variable.index}}}`}
                          placeholderTextColor="#94a3b8"
                          style={styles.input}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                {activeHeaderMediaType ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Header media</Text>
                    <Pressable
                      style={styles.uploadBtn}
                      onPress={() => void uploadHeaderMedia()}
                      disabled={uploadingMedia || !workspaceId}
                    >
                      {uploadingMedia ? (
                        <ActivityIndicator color="#2563eb" />
                      ) : (
                        <Upload color="#2563eb" size={16} />
                      )}
                      <Text style={styles.uploadBtnText}>
                        {headerMedia ? 'Replace media' : 'Upload media'}
                      </Text>
                      <Text style={styles.uploadType}>{activeHeaderMediaType}</Text>
                    </Pressable>
                    {headerMedia ? (
                      <View style={styles.mediaReady}>
                        {activeHeaderMediaType === 'IMAGE' ? (
                          <ImageIcon color="#047857" size={16} />
                        ) : activeHeaderMediaType === 'VIDEO' ? (
                          <Video color="#047857" size={16} />
                        ) : (
                          <FileText color="#047857" size={16} />
                        )}
                        <Text style={styles.mediaReadyText} numberOfLines={1}>
                          {headerMedia.originalName ?? 'Uploaded media'}
                        </Text>
                        <Pressable
                          onPress={() => {
                            setHeaderMedia(null);
                            setHeaderMediaError(null);
                          }}
                          hitSlop={8}
                        >
                          <X color="#047857" size={16} />
                        </Pressable>
                      </View>
                    ) : null}
                    {headerMediaError ? <Text style={styles.mediaError}>{headerMediaError}</Text> : null}
                  </View>
                ) : null}

                <View style={styles.section}>
                  <Text style={styles.previewHeading}>Preview</Text>
                  <View style={styles.previewCard}>
                    <Text style={styles.previewTitle}>
                      {activeTemplate.name.replace(/_/g, ' ')}
                    </Text>
                    {previewHeader ? <Text style={styles.previewHeader}>{previewHeader}</Text> : null}
                    {activeHeaderMediaType ? (
                      <Text style={styles.previewMediaHint}>
                        {headerMedia
                          ? `Header ${activeHeaderMediaType.toLowerCase()}: ${headerMedia.originalName ?? 'ready'}`
                          : `Header ${activeHeaderMediaType.toLowerCase()} required`}
                      </Text>
                    ) : null}
                    <Text style={styles.previewBody}>{previewBody || 'No body content'}</Text>
                    {previewFooter ? <Text style={styles.previewFooter}>{previewFooter}</Text> : null}
                    {(activeTemplate.buttons ?? []).length > 0 ? (
                      <View style={styles.previewButtons}>
                        {(activeTemplate.buttons ?? []).map((button, index) => (
                          <Text key={button.id ?? `${button.label}-${index}`} style={styles.previewButton}>
                            {button.label}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              </ScrollView>

              <Pressable
                style={[styles.sendBtn, !canSendTemplate && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!canSendTemplate}
              >
                <Send color="#fff" size={16} />
                <Text style={styles.sendBtnText}>Send template</Text>
              </Pressable>
              {!canSendTemplate ? (
                <Text style={styles.sendHint}>
                  {missingRequiredVariable
                    ? 'Fill all variables to send'
                    : activeHeaderMediaType && !headerMedia
                      ? 'Upload header media to send'
                      : 'Complete the template to send'}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15,23,42,0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: '#fffdf6',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    flex: 1,
    marginTop: 96,
    maxHeight: '100%',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  panelBody: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    color: '#0f172a',
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  spacer: { flex: 1 },
  iconBtn: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  search: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  list: { flex: 1 },
  row: {
    backgroundColor: '#fff',
    borderColor: '#bfd4ff',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  rowTitle: { color: '#0f172a', flex: 1, fontSize: 14, fontWeight: '700' },
  category: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    color: '#15803d',
    fontSize: 10,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rowBody: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 6 },
  variableCount: { color: '#2563eb', fontSize: 11, fontWeight: '600', marginTop: 8 },
  hint: { color: '#94a3b8', fontSize: 12, marginTop: 8, textAlign: 'center' },
  errorText: { color: '#94a3b8', fontSize: 13, paddingVertical: 18, textAlign: 'center' },
  configureScroll: { flex: 1 },
  configureContent: { gap: 18, paddingBottom: 16 },
  section: { gap: 10 },
  sectionLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  field: { gap: 6 },
  fieldLabel: { color: '#334155', fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  uploadBtn: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#cfe1ff',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  uploadBtnText: { color: '#2563eb', flex: 1, fontSize: 14, fontWeight: '700' },
  uploadType: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  mediaReady: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mediaReadyText: { color: '#065f46', flex: 1, fontSize: 13, fontWeight: '600' },
  mediaError: { color: '#e11d48', fontSize: 12 },
  previewHeading: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewCard: {
    backgroundColor: '#fff',
    borderColor: '#d7e6ff',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  previewTitle: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  previewHeader: { color: '#0f172a', fontSize: 13, fontWeight: '600', lineHeight: 19, marginTop: 8 },
  previewMediaHint: { color: '#64748b', fontSize: 12, marginTop: 8 },
  previewBody: { color: '#334155', fontSize: 13, lineHeight: 19, marginTop: 6 },
  previewFooter: { color: '#94a3b8', fontSize: 12, marginTop: 8 },
  previewButtons: { borderTopColor: '#e2e8f0', borderTopWidth: 1, marginTop: 12, paddingTop: 8 },
  previewButton: {
    color: '#1f6bff',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 8,
    textAlign: 'center',
  },
  sendBtn: {
    alignItems: 'center',
    backgroundColor: '#315efb',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 14,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sendHint: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
});
