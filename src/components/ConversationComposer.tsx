// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { requestRecordingPermissionsAsync, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { FileText, Mic, Pause, Paperclip, Play, Send, Smile, Trash2, X, Zap, PanelsTopLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchQuickReplies, fetchWhatsappTemplates } from '../api/inbox';

type SendAttachment = { uri: string; name: string; mimeType: string; type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT' };
type Props = {
  value: string; onChange: (value: string) => void; onSend: () => void; sending?: boolean;
  attachments?: SendAttachment[]; onAttachments?: (list: SendAttachment[]) => void;
  replyPreview?: { name: string; text: string } | null; onCancelReply?: () => void;
  workspaceId?: string; channelId?: string; channelType?: string; contactName?: string;
  onSendTemplate?: (params: { templateName: string; templateCategory?: string | null; languageCode?: string; text?: string }) => void;
  canSendFreeform?: boolean;
};
const emojis = ['😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '👍', '👏', '🙏', '🔥', '❤️', '🎉', '✅', '😅', '😉', '😎', '🤔', '😭', '😮', '🙌', '💯', '✨'];

function renderQuickReplyBody(body: string, context: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => context[key] ?? context[key.toLowerCase()] ?? match);
}

function renderTemplateSamples(body: string, variables?: Array<{ index?: number; sampleValue?: string | null }>): string {
  if (!variables?.length) return body;
  const byIndex = new Map(variables.filter((v) => v.index != null).map((v) => [v.index, v.sampleValue ?? '']));
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => byIndex.get(Number(index)) ?? match);
}

export function ConversationComposer({ value, onChange, onSend, sending, attachments = [], onAttachments, replyPreview, onCancelReply, workspaceId, channelId, channelType, contactName, onSendTemplate, canSendFreeform = true }: Props) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const quickReplies = useQuery({
    queryKey: ['quick-replies', workspaceId, quickQuery],
    queryFn: () => fetchQuickReplies({ workspaceId, search: quickQuery || undefined, limit: 20 }),
    enabled: quickOpen && Boolean(workspaceId),
  });
  const templates = useQuery({
    queryKey: ['whatsapp-templates', channelId],
    queryFn: () => fetchWhatsappTemplates(channelId),
    enabled: Boolean(channelId),
    staleTime: 60000,
  });
  const approvedTemplates = (templates.data?.items ?? []).filter((template) => (template.status ?? '').toUpperCase() === 'APPROVED').filter((template) => template.name.toLowerCase().includes(templateQuery.toLowerCase()));

  useEffect(() => {
    if (!recording) return;
  }, [recording]);

  async function addFiles(assets: Array<{ uri: string; fileName?: string | null; mimeType?: string | null; type?: string }>) {
    const next = assets.map((asset) => {
      const isVideo = asset.type === 'video';
      const type = isVideo ? 'VIDEO' : 'IMAGE';
      const mimeType = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
      return { uri: asset.uri, name: asset.fileName ?? (isVideo ? 'video.mp4' : 'image.jpg'), mimeType, type } as SendAttachment;
    });
    onAttachments?.([...attachments, ...next]);
  }

  async function chooseImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85, selectionLimit: 0 });
    if (!result.canceled && result.assets?.length) await addFiles(result.assets);
  }
  async function chooseDocument() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (!result.canceled) {
      const next = result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', type: 'DOCUMENT' }) as SendAttachment);
      onAttachments?.([...attachments, ...next]);
    }
  }
  function removeAttachment(uri: string) {
    onAttachments?.(attachments.filter((a) => a.uri !== uri));
  }

  async function startRecording() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) { Alert.alert('Microphone permission', 'Permission to record your voice was denied.'); return; }
    try {
      await setAudioModeAsync({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (error) {
      console.error('[voice] record start failed', error);
      Alert.alert('Recording failed', 'Could not start the recording. Please try again.');
    }
  }
  async function stopRecording(send: boolean) {
    try {
      if (paused) recorder.record();
      await recorder.stop();
    } catch (error) {
      console.error('[voice] record stop failed', error);
    }
    setPaused(false);
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (send && uri) {
      onAttachments?.([...attachments, { uri, name: 'voice-note.m4a', mimeType: 'audio/mp4', type: 'VOICE' }]);
    }
  }

  function togglePause() {
    try {
      if (paused) {
        recorder.record();
        setPaused(false);
      } else {
        recorder.pause();
        setPaused(true);
      }
    } catch (error) {
      console.error('[voice] pause toggle failed', error);
    }
  }

  function insertQuickReply(body: string) {
    const context = { name: contactName ?? 'there', user_name: contactName ?? 'there' };
    const rendered = renderQuickReplyBody(body, context);
    const withoutSlash = value.replace(/(^|\s)\/[^\s]*\s*$/, (match: string, pre: string) => (pre ? match.replace(/\/[^\s]*\s*$/, '') : ''));
    const next = withoutSlash.trim() ? `${withoutSlash.trim()}\n${rendered}` : rendered;
    onChange(next);
    setQuickOpen(false);
  }
  function sendTemplate(template: any) {
    onSendTemplate?.({ templateName: template.name, templateCategory: template.category ?? null, languageCode: template.language ?? 'en_US', text: renderTemplateSamples(template.body ?? '', template.variables) });
    setTemplateOpen(false);
  }

  function handleKeyPress(event: any) {
    if (event.nativeEvent.key === '/' && !quickOpen && (!value || /\s$/.test(value))) {
      setQuickOpen(true);
      setQuickQuery('');
    }
  }

  const recordingSeconds = Math.floor(recorderState.durationMillis / 1000);

  const isWhatsApp = channelType?.toUpperCase() === 'WHATSAPP';
  const windowExpired = isWhatsApp && canSendFreeform === false;

  if (windowExpired) {
    return (
      <>
        <Modal visible={templateOpen} transparent animationType="fade" onRequestClose={() => setTemplateOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setTemplateOpen(false)}>
            <View style={styles.pickerPanel}>
              <View style={styles.pickerHeader}><PanelsTopLeft color="#2563eb" size={16} /><Text style={styles.pickerTitle}>WhatsApp templates</Text><View style={styles.spacer} /><Pressable onPress={() => setTemplateOpen(false)} style={styles.closeBtn}><X color="#64748b" size={20} /></Pressable></View>
              <TextInput autoFocus placeholder="Search templates..." placeholderTextColor="#94a3b8" value={templateQuery} onChangeText={setTemplateQuery} style={styles.pickerSearch} />
              {templates.isLoading ? <ActivityIndicator color="#2563eb" style={styles.pickerLoader} /> : templates.isError ? <Text style={styles.pickerError}>Could not load templates.</Text> : (
                <FlatList
                  data={approvedTemplates}
                  keyExtractor={(item) => item.id}
                  style={styles.pickerList}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={styles.pickerError}>No approved templates found</Text>}
                  renderItem={({ item }) => (
                    <Pressable style={styles.pickerRow} onPress={() => sendTemplate(item)}>
                      <View style={styles.templateNameRow}><Text style={styles.pickerRowTitle}>{item.name}</Text>{item.category ? <Text style={styles.templateCategory}>{String(item.category).toLowerCase()}</Text> : null}</View>
                      {item.body ? <Text numberOfLines={2} style={styles.pickerRowBody}>{renderTemplateSamples(item.body, item.variables)}</Text> : null}
                    </Pressable>
                  )}
                />
              )}
              <Text style={styles.pickerHint}>Send an approved template to the customer</Text>
            </View>
          </Pressable>
        </Modal>

        <View style={styles.blockedComposer}>
          <LinearGradient
            colors={['#fef2f2', '#fff1f2']}
            style={styles.blockedGradient}
          />
          <View style={styles.blockedContent}>
            <PanelsTopLeft color="#dc2626" size={20} style={styles.blockedIcon} />
            <View style={styles.blockedTextWrap}>
              <Text style={styles.blockedTitle}>WhatsApp window expired</Text>
              <Text style={styles.blockedSubtitle}>The WhatsApp customer window has expired. Send an approved template message to continue.</Text>
            </View>
            {channelId ? (
              <Pressable onPress={() => setTemplateOpen(true)} style={styles.blockedTemplateBtn}>
                <LinearGradient
                  colors={['#6366f1', '#8b5cf6']}
                  style={styles.blockedTemplateGradient}
                >
                  <PanelsTopLeft color="#fff" size={16} />
                  <Text style={styles.blockedTemplateBtnText}>Send Template</Text>
                </LinearGradient>
              </Pressable>
            ) : null}
          </View>
        </View>
      </>
    );
  }

  if (recording) {
    return (
      <View style={styles.recording}>
        <Pressable onPress={() => stopRecording(false)} style={styles.delete}><Trash2 color="#fff" size={17} /></Pressable>
        <Text style={[styles.recordTime, paused && styles.recordTimePaused]}>{paused ? '⏸ Paused' : `● ${`0:${String(recordingSeconds).padStart(2, '0')}`}`}</Text>
        <View style={styles.recordingLevels}>
          {[0.4, 0.8, 0.5, 1, 0.6, 0.9, 0.45, 0.75, 0.55, 1, 0.7, 0.4].map((height, index) => (
            <View key={index} style={[styles.levelBar, { height: height * 22 }]} />
          ))}
        </View>
        <Pressable onPress={togglePause} style={[styles.pauseBtn, paused && styles.pauseBtnActive]}>
          {paused ? <Play color="#fff" size={16} /> : <Pause color="#4338ca" size={16} />}
        </Pressable>
        <Pressable onPress={() => stopRecording(true)} style={styles.sendRecording}><Send color="#fff" size={18} /></Pressable>
      </View>
    );
  }

  return (
    <>
      <Modal visible={emojiOpen} transparent animationType="fade" onRequestClose={() => setEmojiOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEmojiOpen(false)}>
          <View style={styles.emojiPanel}>
            <TextInput placeholder="Search" placeholderTextColor="#94a3b8" style={styles.emojiSearch} />
            <Text style={styles.emojiHeading}>Frequently Used</Text>
            <View style={styles.emojiGrid}>{emojis.map((emoji) => <Pressable key={emoji} onPress={() => { onChange(`${value}${emoji}`); setEmojiOpen(false); }}><Text style={styles.emoji}>{emoji}</Text></Pressable>)}</View>
            <Text style={styles.emojiHeading}>Smileys & People</Text>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={quickOpen} transparent animationType="fade" onRequestClose={() => setQuickOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQuickOpen(false)}>
          <View style={styles.pickerPanel}>
             <View style={styles.pickerHeader}><Zap color="#2563eb" size={16} /><Text style={styles.pickerTitle}>Quick replies</Text><Text style={styles.pickerCount}>{quickReplies.data?.items?.length ?? 0}</Text><View style={styles.spacer} /><Pressable onPress={() => setQuickOpen(false)} style={styles.closeBtn}><X color="#64748b" size={20} /></Pressable></View>
            <TextInput autoFocus placeholder="Search by keyword, message" placeholderTextColor="#94a3b8" value={quickQuery} onChangeText={setQuickQuery} style={styles.pickerSearch} />
            {quickReplies.isLoading ? <ActivityIndicator color="#2563eb" style={styles.pickerLoader} /> : quickReplies.isError ? <Text style={styles.pickerError}>Could not load quick replies.</Text> : (
              <FlatList
                data={quickReplies.data?.items ?? []}
                keyExtractor={(item) => item.id}
                style={styles.pickerList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={styles.pickerError}>No quick replies found</Text>}
                renderItem={({ item }) => (
                  <Pressable style={styles.pickerRow} onPress={() => insertQuickReply(item.body)}>
                    <Text style={styles.pickerRowTitle}># {item.title ?? 'Quick reply'}</Text>
                    {item.category ? <Text style={styles.pickerRowCategory}>{item.category}</Text> : null}
                    {item.shortcut ? <Text style={styles.pickerRowShortcut}>/{item.shortcut}</Text> : null}
                    <Text numberOfLines={2} style={styles.pickerRowBody}>{item.body}</Text>
                  </Pressable>
                )}
              />
            )}
            <Text style={styles.pickerHint}>Type / to filter · Click to insert</Text>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={templateOpen} transparent animationType="fade" onRequestClose={() => setTemplateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTemplateOpen(false)}>
          <View style={styles.pickerPanel}>
            <View style={styles.pickerHeader}><PanelsTopLeft color="#2563eb" size={16} /><Text style={styles.pickerTitle}>WhatsApp templates</Text><View style={styles.spacer} /><Pressable onPress={() => setTemplateOpen(false)} style={styles.closeBtn}><X color="#64748b" size={20} /></Pressable></View>
            <TextInput autoFocus placeholder="Search templates..." placeholderTextColor="#94a3b8" value={templateQuery} onChangeText={setTemplateQuery} style={styles.pickerSearch} />
            {templates.isLoading ? <ActivityIndicator color="#2563eb" style={styles.pickerLoader} /> : templates.isError ? <Text style={styles.pickerError}>Could not load templates.</Text> : (
              <FlatList
                data={approvedTemplates}
                keyExtractor={(item) => item.id}
                style={styles.pickerList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={styles.pickerError}>No approved templates found</Text>}
                renderItem={({ item }) => (
                  <Pressable style={styles.pickerRow} onPress={() => sendTemplate(item)}>
                    <View style={styles.templateNameRow}><Text style={styles.pickerRowTitle}>{item.name}</Text>{item.category ? <Text style={styles.templateCategory}>{String(item.category).toLowerCase()}</Text> : null}</View>
                    {item.body ? <Text numberOfLines={2} style={styles.pickerRowBody}>{renderTemplateSamples(item.body, item.variables)}</Text> : null}
                  </Pressable>
                )}
              />
            )}
            <Text style={styles.pickerHint}>Send an approved template to the customer</Text>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.composer}>
        {replyPreview ? (
          <View style={styles.replyPreview}><View style={styles.replyAccent} /><View style={styles.replyCopy}><Text style={styles.replyName}>{replyPreview.name}</Text><Text numberOfLines={1} style={styles.replyText}>{replyPreview.text}</Text></View><Pressable onPress={onCancelReply}><Text style={styles.close}>×</Text></Pressable></View>
        ) : null}
        {attachments.length ? (
          <View style={styles.attachmentRow}>
            {attachments.map((attachment) => (
              <View key={attachment.uri} style={styles.attachment}>
                {attachment.type === 'IMAGE' || attachment.type === 'VIDEO' ? <Image source={{ uri: attachment.uri }} style={styles.attachmentThumb} /> : attachment.type === 'VOICE' ? <Mic color="#2563eb" size={18} /> : <FileText color="#2563eb" size={18} />}
                <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                <Pressable onPress={() => removeAttachment(attachment.uri)}><Text style={styles.close}>×</Text></Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <TextInput multiline value={value} onChangeText={onChange} onKeyPress={handleKeyPress} placeholder="Write a message... use '/' for quick replies" placeholderTextColor="#a88971" style={styles.input} />
        <View style={styles.actions}>
          <Pressable onPress={() => setEmojiOpen(true)}><Smile color="#64748b" size={20} /></Pressable>
          <Pressable onPress={() => Alert.alert('Attachment', 'Choose an image or document', [{ text: 'Image', onPress: chooseImage }, { text: 'Document', onPress: chooseDocument }, { text: 'Cancel', style: 'cancel' }])}><Paperclip color="#64748b" size={20} /></Pressable>
          <Pressable onPress={startRecording}><Mic color="#64748b" size={20} /></Pressable>
          <Pressable onPress={() => setQuickOpen(true)}><Zap color="#64748b" size={20} /></Pressable>
          {channelType?.toUpperCase() === 'WHATSAPP' && channelId ? <Pressable onPress={() => setTemplateOpen(true)}><PanelsTopLeft color="#16a34a" size={20} /></Pressable> : null}
          <View style={styles.spacer} />
          <Pressable onPress={onSend} disabled={sending || (!value.trim() && !attachments.length)} style={[styles.send, (value.trim() || attachments.length) && styles.sendActive, sending && styles.sendDisabled]}>
            <Send color="#fff" size={18} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  composer: { backgroundColor: '#fff9ef', borderColor: '#cfe0fa', borderRadius: 24, borderWidth: 1, margin: 12, padding: 12 },
  input: { color: '#334155', minHeight: 58, textAlignVertical: 'top' },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 18 },
  spacer: { flex: 1 },
  send: { alignItems: 'center', backgroundColor: '#b9dafa', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  sendActive: { backgroundColor: '#2563eb' },
  sendDisabled: { opacity: 0.7 },
  attachmentRow: { gap: 6, marginBottom: 8 },
  attachment: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 16, flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8 },
  attachmentThumb: { borderRadius: 6, height: 26, marginRight: 8, width: 26 },
  attachmentName: { color: '#334155', flex: 1 },
  close: { color: '#64748b', fontSize: 22, marginLeft: 10 },
  recording: { alignItems: 'center', backgroundColor: '#fff5f5', borderColor: '#fecaca', borderRadius: 24, borderWidth: 1, flexDirection: 'row', gap: 12, margin: 12, padding: 12 },
  delete: { alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  recordTime: { color: '#17233a', fontWeight: '600' },
  recordTimePaused: { color: '#94a3b8' },
  recordingLevels: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 3, height: 24, justifyContent: 'center' },
  levelBar: { backgroundColor: '#2563eb', borderRadius: 2, width: 3 },
  pauseBtn: { alignItems: 'center', backgroundColor: '#e0e7ff', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  pauseBtnActive: { backgroundColor: '#4338ca' },
  sendRecording: { alignItems: 'center', backgroundColor: '#16a34a', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  modalBackdrop: { backgroundColor: '#0003', flex: 1, justifyContent: 'flex-end' },
  emojiPanel: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '55%', padding: 16 },
  emojiSearch: { backgroundColor: '#f5f5f5', borderRadius: 10, color: '#17233a', height: 42, paddingHorizontal: 12 },
  emojiHeading: { color: '#64748b', fontSize: 15, fontWeight: '700', marginTop: 16 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 12 },
  emoji: { fontSize: 28 },
  pickerPanel: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', padding: 16 },
  pickerHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  closeBtn: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 18, height: 34, justifyContent: 'center', width: 34 },
  pickerTitle: { color: '#17233a', fontSize: 15, fontWeight: '700' },
  pickerCount: { backgroundColor: '#eef4ff', borderRadius: 10, color: '#2563eb', fontSize: 11, paddingHorizontal: 6, paddingVertical: 2 },
  pickerSearch: { backgroundColor: '#f5f5f5', borderRadius: 10, color: '#17233a', height: 42, marginTop: 12, paddingHorizontal: 12 },
  pickerList: { flexGrow: 0, marginTop: 6, maxHeight: 480 },
  pickerLoader: { marginTop: 24 },
  pickerError: { color: '#64748b', fontSize: 13, paddingVertical: 18, textAlign: 'center' },
  pickerRow: { borderBottomColor: '#eef2f7', borderBottomWidth: 1, paddingVertical: 10 },
  pickerRowTitle: { color: '#17233a', fontSize: 14, fontWeight: '700' },
  pickerRowCategory: { backgroundColor: '#eef4ff', borderRadius: 8, color: '#2563eb', fontSize: 10, marginLeft: 8, paddingHorizontal: 6, paddingVertical: 1 },
  pickerRowShortcut: { color: '#8b5cf6', fontSize: 11, fontWeight: '600', marginLeft: 8 },
  pickerRowBody: { color: '#526987', fontSize: 12, marginTop: 3 },
  pickerHint: { color: '#94a3b8', fontSize: 11, marginTop: 10, textAlign: 'center' },
  templateNameRow: { alignItems: 'center', flexDirection: 'row' },
  templateCategory: { backgroundColor: '#dcfce7', borderRadius: 8, color: '#15803d', fontSize: 10, marginLeft: 8, paddingHorizontal: 6, paddingVertical: 1 },
  replyPreview: { alignItems: 'center', backgroundColor: '#f1f5f9', borderLeftColor: '#8b5cf6', borderLeftWidth: 3, flexDirection: 'row', marginBottom: 8, padding: 8 },
  replyAccent: { width: 2 },
  replyCopy: { flex: 1, marginLeft: 6 },
  replyName: { color: '#7c3aed', fontSize: 12, fontWeight: '700' },
  replyText: { color: '#64748b', fontSize: 12, marginTop: 2 },
  blockedComposer: { borderRadius: 24, borderWidth: 1, borderColor: '#fecaca', margin: 12, overflow: 'hidden' },
  blockedGradient: { ...StyleSheet.absoluteFillObject },
  blockedContent: { padding: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  blockedIcon: { marginRight: 10 },
  blockedTextWrap: { flex: 1, minWidth: 200 },
  blockedTitle: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
  blockedSubtitle: { color: '#7f1d1d', fontSize: 12, marginTop: 3, lineHeight: 17 },
  blockedTemplateBtn: { marginTop: 12, width: '100%', borderRadius: 12, overflow: 'hidden' },
  blockedTemplateGradient: { padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  blockedTemplateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
