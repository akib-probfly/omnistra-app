// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { requestRecordingPermissionsAsync, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { ChevronDown, Clock3, FileText, Mic, Pause, Paperclip, Play, Send, Smile, Trash2, X, Zap, PanelsTopLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { EmojiKeyboard, type EmojiType } from 'rn-emoji-keyboard';
import { fetchQuickReplies, fetchWhatsappTemplates } from '../api/inbox';
import {
  COMPOSER_MAX_ATTACHMENT_COUNT,
  getComposerAttachmentValidationError,
  normalizeComposerMimeType,
  resolveAttachmentSizeBytes,
} from '../lib/composer-attachments';
import type { MessengerMessagingMode } from '../lib/inbox-utils';

type SendAttachment = { uri: string; name: string; mimeType: string; type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT'; sizeBytes?: number | null };
type Props = {
  value: string; onChange: (value: string) => void; onSend: () => void; sending?: boolean;
  attachments?: SendAttachment[]; onAttachments?: (list: SendAttachment[]) => void;
  replyPreview?: { name: string; text: string } | null; onCancelReply?: () => void;
  workspaceId?: string; channelId?: string; channelType?: string; contactName?: string;
  onSendTemplate?: (params: { templateName: string; templateCategory?: string | null; languageCode?: string; text?: string }) => void;
  canSendFreeform?: boolean;
  messengerMessagingMode?: MessengerMessagingMode;
  onMessengerMessagingModeChange?: (mode: MessengerMessagingMode) => void;
  canSendStandardMessage?: boolean;
  canSendHumanAgentMessage?: boolean;
};

function renderQuickReplyBody(body: string, context: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => context[key] ?? context[key.toLowerCase()] ?? match);
}

function renderTemplateSamples(body: string, variables?: Array<{ index?: number; sampleValue?: string | null }>): string {
  if (!variables?.length) return body;
  const byIndex = new Map(variables.filter((v) => v.index != null).map((v) => [v.index, v.sampleValue ?? '']));
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => byIndex.get(Number(index)) ?? match);
}

export function ConversationComposer({
  value,
  onChange,
  onSend,
  sending,
  attachments = [],
  onAttachments,
  replyPreview,
  onCancelReply,
  workspaceId,
  channelId,
  channelType,
  contactName,
  onSendTemplate,
  canSendFreeform = true,
  messengerMessagingMode = 'STANDARD',
  onMessengerMessagingModeChange,
  canSendStandardMessage = false,
  canSendHumanAgentMessage = false,
}: Props) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const [messengerModeOpen, setMessengerModeOpen] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const isWhatsAppChannel = (channelType ?? '').toUpperCase() === 'WHATSAPP';
  const isMessengerChannel = (channelType ?? '').toUpperCase() === 'MESSENGER';
  const quickReplies = useQuery({
    queryKey: ['quick-replies', workspaceId, quickQuery],
    queryFn: () => fetchQuickReplies({ workspaceId, search: quickQuery || undefined, limit: 20 }),
    enabled: quickOpen && Boolean(workspaceId),
  });
  const templates = useQuery({
    queryKey: ['whatsapp-templates', channelId],
    queryFn: () => fetchWhatsappTemplates(channelId!),
    enabled: isWhatsAppChannel && Boolean(channelId),
    staleTime: 60000,
  });
  const approvedTemplates = (templates.data?.items ?? []).filter((template) => (template.status ?? '').toUpperCase() === 'APPROVED').filter((template) => template.name.toLowerCase().includes(templateQuery.toLowerCase()));

  useEffect(() => {
    if (!recording) return;
  }, [recording]);

  async function appendValidatedAttachments(
    candidates: Array<{
      uri: string;
      name: string;
      mimeType?: string | null;
      type: SendAttachment['type'];
      sizeBytes?: number | null;
    }>,
  ) {
    const remaining = Math.max(0, COMPOSER_MAX_ATTACHMENT_COUNT - attachments.length);
    if (remaining <= 0) {
      Alert.alert('Attachment limit', `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once.`);
      return;
    }

    const selected = candidates.slice(0, remaining);
    const skippedForLimit = candidates.length - selected.length;
    const accepted: SendAttachment[] = [];
    const rejected: string[] = [];

    for (const candidate of selected) {
      const mimeType = normalizeComposerMimeType(
        candidate.mimeType,
        candidate.name,
        candidate.type === 'IMAGE' ? 'image/jpeg' : candidate.type === 'VIDEO' ? 'video/mp4' : candidate.type === 'VOICE' || candidate.type === 'AUDIO' ? 'audio/mp4' : 'application/octet-stream',
      );
      const sizeBytes = await resolveAttachmentSizeBytes(candidate.uri, candidate.sizeBytes);
      const error = await getComposerAttachmentValidationError({
        mimeType,
        sizeBytes,
        channelType: channelType ?? 'WHATSAPP',
      });
      if (error) {
        rejected.push(`${candidate.name}: ${error}`);
        continue;
      }
      accepted.push({
        uri: candidate.uri,
        name: candidate.name,
        mimeType,
        type: candidate.type,
        sizeBytes,
      });
    }

    if (accepted.length) {
      onAttachments?.([...attachments, ...accepted]);
    }

    if (skippedForLimit > 0 || rejected.length) {
      const lines = [
        skippedForLimit > 0
          ? `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once. ${skippedForLimit} file${skippedForLimit === 1 ? '' : 's'} skipped.`
          : null,
        ...rejected.slice(0, 4),
        rejected.length > 4 ? `…and ${rejected.length - 4} more.` : null,
      ].filter(Boolean);
      Alert.alert('Some files were skipped', lines.join('\n'));
    }
  }

  async function chooseImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo library access to attach images and videos.');
      return;
    }
    const remaining = Math.max(0, COMPOSER_MAX_ATTACHMENT_COUNT - attachments.length);
    if (remaining <= 0) {
      Alert.alert('Attachment limit', `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    await appendValidatedAttachments(
      result.assets.map((asset, index) => {
        const isVideo = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
        return {
          uri: asset.uri,
          name: asset.fileName ?? (isVideo ? `video-${index + 1}.mp4` : `image-${index + 1}.jpg`),
          mimeType: asset.mimeType,
          type: isVideo ? 'VIDEO' : 'IMAGE',
          sizeBytes: asset.fileSize ?? null,
        };
      }),
    );
  }

  async function chooseDocument() {
    const remaining = Math.max(0, COMPOSER_MAX_ATTACHMENT_COUNT - attachments.length);
    if (remaining <= 0) {
      Alert.alert('Attachment limit', `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once.`);
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled || !result.assets?.length) return;
    await appendValidatedAttachments(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        type: 'DOCUMENT',
        sizeBytes: asset.size ?? null,
      })),
    );
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
      await appendValidatedAttachments([{
        uri,
        name: 'voice-note.m4a',
        mimeType: 'audio/mp4',
        type: 'VOICE',
      }]);
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

  const isWhatsApp = isWhatsAppChannel;
  const whatsappWindowExpired = isWhatsApp && canSendFreeform === false;
  const messengerWindowExpired = isMessengerChannel && !canSendStandardMessage && !canSendHumanAgentMessage;
  const canComposeFreeform = canSendFreeform !== false;

  if (messengerWindowExpired) {
    return (
      <View style={styles.blockedComposer}>
        <LinearGradient colors={['#fff7ed', '#fff1f2']} style={styles.blockedGradient} />
        <View style={styles.blockedContent}>
          <Clock3 color="#dc2626" size={20} style={styles.blockedIcon} />
          <View style={styles.blockedTextWrap}>
            <Text style={styles.blockedTitle}>Messenger window expired</Text>
            <Text style={styles.blockedSubtitle}>
              The Messenger messaging window has expired. Free-form replies are unavailable after seven days.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (whatsappWindowExpired) {
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

      <View style={[styles.composer, emojiOpen && styles.composerWithEmoji]}>
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
        <TextInput
          multiline
          scrollEnabled
          value={value}
          onChangeText={onChange}
          onKeyPress={handleKeyPress}
          onFocus={() => setEmojiOpen(false)}
          editable={canComposeFreeform}
          placeholder={canComposeFreeform ? "Write a message... use '/' for quick replies" : 'Messaging window unavailable'}
          placeholderTextColor="#a88971"
          style={styles.input}
        />
        <View style={styles.actions}>
          {isMessengerChannel ? (
            <Pressable style={styles.messengerModeChip} onPress={() => setMessengerModeOpen(true)}>
              <Text style={styles.messengerModeChipText} numberOfLines={1}>
                {messengerMessagingMode === 'STANDARD' ? 'Standard' : 'Human'}
              </Text>
              <ChevronDown color="#475569" size={14} />
            </Pressable>
          ) : null}
          <Pressable
            disabled={!canComposeFreeform}
            onPress={() => {
              if (emojiOpen) {
                setEmojiOpen(false);
                return;
              }
              Keyboard.dismiss();
              setEmojiOpen(true);
            }}
            style={!canComposeFreeform ? styles.actionDisabled : undefined}
          >
            <Smile color={emojiOpen ? '#2563eb' : '#64748b'} size={20} />
          </Pressable>
          <Pressable
            disabled={!canComposeFreeform}
            onPress={() => Alert.alert('Attachment', 'Choose an image or document', [{ text: 'Image', onPress: chooseImage }, { text: 'Document', onPress: chooseDocument }, { text: 'Cancel', style: 'cancel' }])}
            style={!canComposeFreeform ? styles.actionDisabled : undefined}
          >
            <Paperclip color="#64748b" size={20} />
          </Pressable>
          <Pressable disabled={!canComposeFreeform} onPress={startRecording} style={!canComposeFreeform ? styles.actionDisabled : undefined}>
            <Mic color="#64748b" size={20} />
          </Pressable>
          <Pressable disabled={!canComposeFreeform} onPress={() => { setEmojiOpen(false); setQuickOpen(true); }} style={!canComposeFreeform ? styles.actionDisabled : undefined}>
            <Zap color="#64748b" size={20} />
          </Pressable>
          {isWhatsAppChannel && channelId ? <Pressable onPress={() => { setEmojiOpen(false); setTemplateOpen(true); }}><PanelsTopLeft color="#16a34a" size={20} /></Pressable> : null}
          <View style={styles.spacer} />
          <Pressable
            onPress={onSend}
            disabled={sending || !canComposeFreeform || (!value.trim() && !attachments.length)}
            style={[styles.send, canComposeFreeform && (value.trim() || attachments.length) && styles.sendActive, (sending || !canComposeFreeform) && styles.sendDisabled]}
          >
            <Send color="#fff" size={18} />
          </Pressable>
        </View>
      </View>

      {emojiOpen ? (
        <View style={styles.emojiPanel}>
          <EmojiKeyboard
            onEmojiSelected={(emoji: EmojiType) => {
              const next = `${valueRef.current}${emoji.emoji}`;
              valueRef.current = next;
              onChange(next);
            }}
            allowMultipleSelections
            enableSearchBar
            enableRecentlyUsed
            expandable={false}
            disableSafeArea
            defaultHeight={280}
            categoryPosition="bottom"
            theme={{
              container: '#ffffff',
              header: '#0f172a',
              skinTonesContainer: '#f1f5f9',
              category: {
                icon: '#64748b',
                iconActive: '#2563eb',
                container: '#f8fafc',
                containerActive: '#e2e8f0',
              },
            }}
          />
        </View>
      ) : null}

      <Modal visible={messengerModeOpen} transparent animationType="fade" onRequestClose={() => setMessengerModeOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMessengerModeOpen(false)}>
          <View style={styles.modeSheet}>
            <Text style={styles.modeSheetTitle}>Messenger messaging mode</Text>
            <Pressable
              style={[styles.modeOption, messengerMessagingMode === 'STANDARD' && styles.modeOptionActive, !canSendStandardMessage && styles.modeOptionDisabled]}
              disabled={!canSendStandardMessage}
              onPress={() => {
                onMessengerMessagingModeChange?.('STANDARD');
                setMessengerModeOpen(false);
              }}
            >
              <Text style={styles.modeOptionTitle}>Standard</Text>
              <Text style={styles.modeOptionBody}>Normal reply within 24 hours</Text>
            </Pressable>
            <Pressable
              style={[styles.modeOption, messengerMessagingMode === 'HUMAN_AGENT' && styles.modeOptionActive, !canSendHumanAgentMessage && styles.modeOptionDisabled]}
              disabled={!canSendHumanAgentMessage}
              onPress={() => {
                onMessengerMessagingModeChange?.('HUMAN_AGENT');
                setMessengerModeOpen(false);
              }}
            >
              <Text style={styles.modeOptionTitle}>Human Agent</Text>
              <Text style={styles.modeOptionBody}>Manual, non-promotional support reply within 7 days</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  composer: { backgroundColor: '#fff9ef', borderColor: '#cfe0fa', borderRadius: 24, borderWidth: 1, margin: 12, padding: 12 },
  composerWithEmoji: { marginBottom: 0 },
  emojiPanel: {
    backgroundColor: '#fff',
    borderTopColor: '#e2e8f0',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 280,
    overflow: 'hidden',
  },
  input: {
    color: '#334155',
    maxHeight: 140,
    minHeight: 58,
    paddingVertical: 4,
    textAlignVertical: 'top',
  },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  actionDisabled: { opacity: 0.35 },
  messengerModeChip: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#dbe4f1',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    maxWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  messengerModeChipText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  modeSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 8,
    padding: 16,
  },
  modeSheetTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  modeOption: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modeOptionActive: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  modeOptionDisabled: { opacity: 0.45 },
  modeOptionTitle: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  modeOptionBody: { color: '#64748b', fontSize: 12, marginTop: 3 },
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
