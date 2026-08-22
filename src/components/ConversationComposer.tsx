import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { requestRecordingPermissionsAsync, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Camera, ChevronDown, Clock3, FileText, Film, Image as ImageIcon, Mic, Pause, Paperclip, Play, Send, Smile, Trash2, X, Zap, PanelsTopLeft } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Image, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { showNotice } from './AppToast';
import { LinearGradient } from 'expo-linear-gradient';
import { EmojiKeyboard, type EmojiType } from 'rn-emoji-keyboard';
import { fetchQuickReplyPicker, isQuickReplyImageAttachment, quickReplyAttachmentPreviewUrl, type QuickReplySnippet } from '../api/quickReplies';
import { AuthenticatedImage, downloadMedia } from './AuthenticatedImage';
import { fetchWhatsappTemplates } from '../api/whatsappTemplates';
import {
  COMPOSER_MAX_ATTACHMENT_COUNT,
  formatAttachmentSize,
  getComposerAttachmentValidationError,
  normalizeComposerMimeType,
  resolveAttachmentSizeBytes,
} from '../lib/composer-attachments';
import type { MessengerMessagingMode } from '../lib/inbox-utils';
import { getReplyPreviewPresentation } from '../lib/inbox-utils';
import { BottomSheet, SheetFlatList } from './BottomSheet';
import { PanelSkeleton } from './Skeleton';
import { WhatsappTemplateSendModal, type TemplateSendPayload } from './WhatsappTemplateSendModal';
import { useTheme } from '../theme/ThemeContext';

type SendAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT';
  sizeBytes?: number | null;
  durationMs?: number | null;
  fileId?: string;
  quickReplySnippetId?: string;
};
export type ComposerSendPayload = { attachments?: SendAttachment[]; text?: string };
type Props = {
  value: string; onChange: (value: string) => void; onSend: (payload?: ComposerSendPayload) => void; sending?: boolean;
  attachments?: SendAttachment[]; onAttachments?: (list: SendAttachment[]) => void;
  replyPreview?: { name: string; text: string; mediaType?: string | null } | null; onCancelReply?: () => void;
  workspaceId?: string; channelId?: string; channelType?: string; conversationId?: string; contactName?: string;
  onSendTemplate?: (params: TemplateSendPayload) => void;
  canSendFreeform?: boolean;
  messengerMessagingMode?: MessengerMessagingMode;
  onMessengerMessagingModeChange?: (mode: MessengerMessagingMode) => void;
  canSendStandardMessage?: boolean;
  canSendHumanAgentMessage?: boolean;
  messengerMessagingReady?: boolean;
};

function renderQuickReplyBody(body: string, context: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => context[key] ?? context[key.toLowerCase()] ?? match);
}

function QuickRepliesList({ items, onInsert }: { items: QuickReplySnippet[]; onInsert: (snippet: QuickReplySnippet) => void }) {
  const { colors } = useTheme();
  return (
    <SheetFlatList
      data={items}
      keyExtractor={(item) => item.id}
      style={styles.pickerList}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Text style={[styles.pickerError, { color: colors.textSecondary }]}>No quick replies found</Text>}
      renderItem={({ item }) => {
        const previewAttachment = (item.attachments ?? []).find(isQuickReplyImageAttachment);
        const previewUrl = previewAttachment ? quickReplyAttachmentPreviewUrl(previewAttachment) : '';
        return (
          <Pressable style={[styles.pickerRow, { borderBottomColor: colors.separator }]} onPress={() => onInsert(item)}>
            <View style={styles.pickerRowMain}>
              <Text style={[styles.pickerRowTitle, { color: colors.text }]}># {item.title ?? 'Quick reply'}</Text>
              {item.category ? <Text style={styles.pickerRowCategory}>{item.category}</Text> : null}
              {item.shortcut ? <Text style={styles.pickerRowShortcut}>/{item.shortcut}</Text> : null}
              <Text numberOfLines={2} style={[styles.pickerRowBody, { color: colors.textSecondary }]}>{item.body}</Text>
            </View>
            {previewUrl ? <AuthenticatedImage url={previewUrl} style={styles.pickerThumb} resizeMode="cover" /> : null}
          </Pressable>
        );
      }}
    />
  );
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
  conversationId,
  contactName,
  onSendTemplate,
  canSendFreeform = true,
  messengerMessagingMode = 'STANDARD',
  onMessengerMessagingModeChange,
  canSendStandardMessage = false,
  canSendHumanAgentMessage = false,
  messengerMessagingReady = true,
}: Props) {
  const { colors, isDark } = useTheme();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const [messengerModeOpen, setMessengerModeOpen] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const remainingAttachmentSlots = Math.max(0, COMPOSER_MAX_ATTACHMENT_COUNT - attachments.length);

  const isWhatsAppChannel = (channelType ?? '').toUpperCase() === 'WHATSAPP';
  const isMessengerChannel = (channelType ?? '').toUpperCase() === 'MESSENGER';
  const quickReplies = useQuery({
    queryKey: ['quick-replies', 'picker', workspaceId, conversationId, channelType, quickQuery],
    queryFn: () => fetchQuickReplyPicker({
      workspaceId,
      conversationId,
      channelType: channelType ? channelType.toUpperCase() : undefined,
      search: quickQuery || undefined,
      limit: 20,
    }),
    enabled: quickOpen && Boolean(workspaceId),
  });
  const templates = useQuery({
    queryKey: ['whatsapp-templates', channelId],
    queryFn: () => fetchWhatsappTemplates(channelId!),
    enabled: isWhatsAppChannel && Boolean(channelId),
    staleTime: 60000,
  });
  const approvedTemplates = (templates.data?.items ?? []).filter((template) => (template.status ?? '').toUpperCase() === 'APPROVED').filter((template) => template.name.toLowerCase().includes(templateQuery.toLowerCase()));

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
      showNotice('Attachment limit', `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once.`);
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
      showNotice('Some files were skipped', lines.join('\n'));
    }
  }

  function openAttachmentPicker() {
    if (canSendFreeform === false) return;
    if (remainingAttachmentSlots <= 0) {
      showNotice('Attachment limit', `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once.`);
      return;
    }
    Keyboard.dismiss();
    setEmojiOpen(false);
    setAttachmentPickerOpen(true);
  }

  async function runAttachmentAction(action: () => Promise<void>) {
    setAttachmentPickerOpen(false);
    // Let the sheet dismiss before opening the system picker.
    await new Promise((resolve) => setTimeout(resolve, 220));
    await action();
  }

  async function chooseImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showNotice('Permission required', 'Allow photo library access to attach images and videos.');
      return;
    }
    if (remainingAttachmentSlots <= 0) {
      showNotice('Attachment limit', `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: remainingAttachmentSlots,
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

  async function chooseCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showNotice('Permission required', 'Allow camera access to take a photo or video.');
      return;
    }
    if (remainingAttachmentSlots <= 0) {
      showNotice('Attachment limit', `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once.`);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      videoMaxDuration: 60,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    await appendValidatedAttachments(
      result.assets.map((asset, index) => {
        const isVideo = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
        return {
          uri: asset.uri,
          name: asset.fileName ?? (isVideo ? `camera-video-${index + 1}.mp4` : `camera-photo-${index + 1}.jpg`),
          mimeType: asset.mimeType,
          type: isVideo ? 'VIDEO' : 'IMAGE',
          sizeBytes: asset.fileSize ?? null,
        };
      }),
    );
  }

  async function chooseDocument() {
    if (remainingAttachmentSlots <= 0) {
      showNotice('Attachment limit', `You can attach up to ${COMPOSER_MAX_ATTACHMENT_COUNT} files at once.`);
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
    if (sending) return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) { showNotice('Microphone permission', 'Permission to record your voice was denied.'); return; }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPaused(false);
      setRecording(true);
    } catch (error) {
      console.error('[voice] record start failed', error);
      showNotice('Recording failed', 'Could not start the recording. Please try again.');
    }
  }
  async function stopRecording(send: boolean) {
    if (sending) return;
    const recordedDurationMs = recorderState.durationMillis > 0 ? recorderState.durationMillis : null;
    try {
      if (paused) recorder.record();
      await recorder.stop();
    } catch (error) {
      console.error('[voice] record stop failed', error);
      setPaused(false);
      setRecording(false);
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {
        // ignore audio mode reset failures
      }
      if (send) {
        showNotice('Recording failed', 'Could not finish the recording. Please try again.');
      }
      return;
    }
    setPaused(false);
    setRecording(false);
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // ignore audio mode reset failures
    }
    const uri = recorder.uri;
    if (!send) return;
    if (!uri) {
      showNotice('Recording failed', 'No audio was captured. Please try again.');
      return;
    }

    const voiceAttachment: SendAttachment = {
      uri,
      name: `voice-note-${Date.now()}.m4a`,
      mimeType: 'audio/mp4',
      type: 'VOICE',
      durationMs: recordedDurationMs,
    };
    const sizeBytes = await resolveAttachmentSizeBytes(uri);
    const validationError = await getComposerAttachmentValidationError({
      mimeType: voiceAttachment.mimeType,
      sizeBytes,
      channelType: channelType ?? 'WHATSAPP',
    });
    if (validationError) {
      showNotice('Could not send voice note', validationError);
      return;
    }

    // Send immediately (matches web). Do not stage in the composer — that left a stuck Mic+X preview.
    onSend({ attachments: [{ ...voiceAttachment, sizeBytes }], text: '' });
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

  function insertQuickReply(snippet: QuickReplySnippet) {
    const context = { name: contactName ?? 'there', user_name: contactName ?? 'there' };
    const rendered = renderQuickReplyBody(snippet.body, context);
    const withoutSlash = value.replace(/(^|\s)\/[^\s]*\s*$/, (match: string, pre: string) => (pre ? match.replace(/\/[^\s]*\s*$/, '') : ''));
    const next = withoutSlash.trim() ? `${withoutSlash.trim()}\n${rendered}` : rendered;
    onChange(next);
    setQuickOpen(false);

    const snippetAttachments = snippet.attachments ?? [];
    if (!onAttachments || snippetAttachments.length === 0) return;

    void (async () => {
      const staged: SendAttachment[] = [];
      for (const attachment of snippetAttachments) {
        const sourceUrl = quickReplyAttachmentPreviewUrl(attachment) || attachment.downloadUrl || `files/${attachment.id}/download`;
        let uri = sourceUrl;
        try {
          if (sourceUrl && !/^(file|content|ph|assets-library):/i.test(sourceUrl)) {
            uri = await downloadMedia(sourceUrl);
          }
        } catch (error) {
          console.error('[quick-reply] attachment preview failed', attachment.id, error);
        }
        const mimeType = attachment.mimeType ?? 'application/octet-stream';
        const media = (attachment.mediaType ?? '').toUpperCase();
        const type: SendAttachment['type'] = media === 'VIDEO' || mimeType.startsWith('video/')
          ? 'VIDEO'
          : media === 'AUDIO' || media === 'VOICE' || mimeType.startsWith('audio/')
            ? 'AUDIO'
            : media === 'IMAGE' || media === 'STICKER' || mimeType.startsWith('image/')
              ? 'IMAGE'
              : 'DOCUMENT';
        staged.push({
          uri,
          fileId: attachment.id,
          quickReplySnippetId: snippet.id,
          name: attachment.originalName ?? 'attachment',
          mimeType,
          type,
          sizeBytes: attachment.sizeBytes ?? null,
        });
      }
      if (staged.length) onAttachments([...attachments, ...staged].slice(0, COMPOSER_MAX_ATTACHMENT_COUNT));
    })();
  }

  function handleSendTemplate(payload: TemplateSendPayload) {
    onSendTemplate?.(payload);
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
  const messengerWindowExpired = isMessengerChannel && messengerMessagingReady && !canSendStandardMessage && !canSendHumanAgentMessage;
  const canComposeFreeform = canSendFreeform !== false;

  if (messengerWindowExpired) {
    return (
        <View style={styles.blockedComposer}>
          <LinearGradient colors={['#fff7ed', '#fff1f2']} style={styles.blockedGradient} />
          <View style={styles.blockedContent}>
            <Clock3 color={colors.error} size={20} style={styles.blockedIcon} />
          <View style={styles.blockedTextWrap}>
            <Text style={[styles.blockedTitle, { color: colors.error }]}>Messenger window expired</Text>
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
        <WhatsappTemplateSendModal
          visible={templateOpen}
          templates={approvedTemplates}
          loading={templates.isLoading}
          error={templates.isError}
          query={templateQuery}
          onQueryChange={setTemplateQuery}
          workspaceId={workspaceId}
          onClose={() => setTemplateOpen(false)}
          onSend={handleSendTemplate}
        />

        <View style={styles.blockedComposer}>
          <LinearGradient
            colors={['#fef2f2', '#fff1f2']}
            style={styles.blockedGradient}
          />
          <View style={styles.blockedContent}>
            <PanelsTopLeft color={colors.error} size={20} style={styles.blockedIcon} />
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
                  <PanelsTopLeft color={colors.surface} size={16} />
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
        <Pressable disabled={sending} onPress={() => stopRecording(false)} style={styles.delete}><Trash2 color={colors.surface} size={17} /></Pressable>
        <Text style={[styles.recordTime, paused && styles.recordTimePaused]}>{paused ? '⏸ Paused' : `● ${`0:${String(recordingSeconds).padStart(2, '0')}`}`}</Text>
        <View style={styles.recordingLevels}>
          {[0.4, 0.8, 0.5, 1, 0.6, 0.9, 0.45, 0.75, 0.55, 1, 0.7, 0.4].map((height, index) => (
            <View key={index} style={[styles.levelBar, { height: height * 22 }]} />
          ))}
        </View>
        <Pressable disabled={sending} onPress={togglePause} style={[styles.pauseBtn, paused && styles.pauseBtnActive]}>
          {paused ? <Play color={colors.surface} size={16} /> : <Pause color="#4338ca" size={16} />}
        </Pressable>
        <Pressable disabled={sending} onPress={() => stopRecording(true)} style={[styles.sendRecording, sending && styles.sendDisabled]}><Send color={colors.surface} size={18} /></Pressable>
      </View>
    );
  }

  return (
    <>
      <BottomSheet visible={quickOpen} onClose={() => setQuickOpen(false)}>
        <View style={styles.pickerPanel}>
          <View style={styles.pickerHeader}>
            <Zap color={colors.primary} size={16} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Quick replies</Text>
            <Text style={styles.pickerCount}>{quickReplies.data?.items?.length ?? 0}</Text>
            <View style={styles.spacer} />
          </View>
          <TextInput autoFocus placeholder="Search by keyword, message" placeholderTextColor={colors.textMuted} value={quickQuery} onChangeText={setQuickQuery} style={[styles.pickerSearch, { backgroundColor: colors.background, color: colors.text }]} />
          {quickReplies.isLoading ? <PanelSkeleton rows={4} /> : quickReplies.isError ? <Text style={[styles.pickerError, { color: colors.textSecondary }]}>Could not load quick replies.</Text> : (
            <QuickRepliesList
              items={quickReplies.data?.items ?? []}
              onInsert={insertQuickReply}
            />
          )}
          <Text style={[styles.pickerHint, { color: colors.textMuted }]}>Type / to filter · Click to insert</Text>
        </View>
      </BottomSheet>

      <WhatsappTemplateSendModal
        visible={templateOpen}
        templates={approvedTemplates}
        loading={templates.isLoading}
        error={templates.isError}
        query={templateQuery}
        onQueryChange={setTemplateQuery}
        workspaceId={workspaceId}
        onClose={() => setTemplateOpen(false)}
        onSend={handleSendTemplate}
      />

      <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, emojiOpen && styles.composerWithEmoji]}>
        {replyPreview ? (
           <View style={[styles.replyPreview, { backgroundColor: colors.surfaceSecondary, borderLeftColor: colors.primary }]}>
            <View style={styles.replyAccent} />
            <View style={styles.replyCopy}>
              <Text style={styles.replyName}>{replyPreview.name}</Text>
              {(() => {
                const presentation = getReplyPreviewPresentation(replyPreview.text, replyPreview.mediaType);
                const Icon = presentation.kind === 'photo' || presentation.kind === 'sticker' ? ImageIcon
                  : presentation.kind === 'video' ? Film
                  : presentation.kind === 'audio' || presentation.kind === 'voice' ? Mic
                  : presentation.kind === 'document' ? FileText
                  : null;
                return (
                  <View style={styles.replyTypeRow}>
                    {Icon ? <Icon color="#64748b" size={13} /> : null}
                    <Text numberOfLines={1} style={styles.replyText}>{presentation.label}</Text>
                  </View>
                );
              })()}
            </View>
            <Pressable onPress={onCancelReply}><Text style={styles.close}>×</Text></Pressable>
          </View>
        ) : null}
        {attachments.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.attachmentScroll}
            contentContainerStyle={styles.attachmentRow}
          >
            {attachments.map((attachment) => {
              const isMedia = attachment.type === 'IMAGE' || attachment.type === 'VIDEO';
              const sizeLabel = formatAttachmentSize(attachment.sizeBytes);
              return (
                <View
                  key={attachment.uri}
                  style={[
                    isMedia ? styles.attachmentMedia : styles.attachment,
                    isMedia
                      ? { backgroundColor: colors.surfaceSecondary }
                      : { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                  ]}
                >
                  {isMedia ? (
                    <>
                      <Image source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
                      {attachment.type === 'VIDEO' ? (
                        <View style={styles.attachmentMediaBadge}>
                          <Film color="#fff" size={12} />
                        </View>
                      ) : null}
                    </>
                  ) : attachment.type === 'VOICE' ? (
                    <>
                      <View style={[styles.attachmentIconWrap, { backgroundColor: '#eff6ff' }]}>
                        <Mic color={colors.primary} size={16} />
                      </View>
                      <View style={styles.attachmentCopy}>
                        <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.text }]}>Voice note</Text>
                        {sizeLabel ? <Text style={[styles.attachmentMeta, { color: colors.textMuted }]}>{sizeLabel}</Text> : null}
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[styles.attachmentIconWrap, { backgroundColor: '#eff6ff' }]}>
                        <FileText color={colors.primary} size={16} />
                      </View>
                      <View style={styles.attachmentCopy}>
                        <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.text }]}>{attachment.name}</Text>
                        {sizeLabel ? <Text style={[styles.attachmentMeta, { color: colors.textMuted }]}>{sizeLabel}</Text> : null}
                      </View>
                    </>
                  )}
                  <Pressable
                    onPress={() => removeAttachment(attachment.uri)}
                    style={isMedia ? styles.attachmentRemove : styles.attachmentChipRemove}
                    hitSlop={6}
                  >
                    {isMedia ? (
                      <Text style={styles.attachmentRemoveText}>×</Text>
                    ) : (
                      <X color={colors.textSecondary} size={14} />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
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
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.textSecondary }]}
        />
        <View style={styles.actions}>
          {isMessengerChannel ? (
             <Pressable style={[styles.messengerModeChip, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} onPress={() => setMessengerModeOpen(true)}>
              <Text style={[styles.messengerModeChipText, { color: colors.text }]} numberOfLines={1}>
                {messengerMessagingMode === 'STANDARD' ? 'Standard' : 'Human'}
              </Text>
               <ChevronDown color={colors.textSecondary} size={14} />
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
            <Smile color={emojiOpen ? colors.primary : colors.textSecondary} size={20} />
          </Pressable>
          <Pressable
            disabled={!canComposeFreeform}
            onPress={openAttachmentPicker}
            style={!canComposeFreeform ? styles.actionDisabled : undefined}
          >
            <Paperclip color={attachmentPickerOpen ? colors.primary : colors.textSecondary} size={20} />
          </Pressable>
          <Pressable disabled={!canComposeFreeform} onPress={startRecording} style={!canComposeFreeform ? styles.actionDisabled : undefined}>
            <Mic color={colors.textSecondary} size={20} />
          </Pressable>
          <Pressable disabled={!canComposeFreeform} onPress={() => { setEmojiOpen(false); setQuickOpen(true); }} style={!canComposeFreeform ? styles.actionDisabled : undefined}>
            <Zap color={colors.textSecondary} size={20} />
          </Pressable>
          {isWhatsAppChannel && channelId ? <Pressable onPress={() => { setEmojiOpen(false); setTemplateOpen(true); }}><PanelsTopLeft color="#16a34a" size={20} /></Pressable> : null}
          <View style={styles.spacer} />
          <Pressable
            onPress={() => onSend()}
            disabled={sending || !canComposeFreeform || (!value.trim() && !attachments.length)}
            style={[styles.send, canComposeFreeform && Boolean(value.trim() || attachments.length) && styles.sendActive, (sending || !canComposeFreeform) && styles.sendDisabled]}
          >
            <Send color={colors.surface} size={18} />
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
              container: colors.surface,
              header: colors.text,
              skinTonesContainer: colors.surfaceSecondary,
              category: {
                icon: colors.textSecondary,
                iconActive: colors.primary,
                container: colors.background,
                containerActive: colors.cardBorder,
              },
            }}
          />
        </View>
      ) : null}

      <BottomSheet visible={attachmentPickerOpen} onClose={() => setAttachmentPickerOpen(false)}>
        <View style={styles.attachSheet}>
          <View style={styles.attachSheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.attachSheetTitle, { color: colors.text }]}>Add attachment</Text>
              <Text style={[styles.attachSheetSubtitle, { color: colors.textSecondary }]}>
                {remainingAttachmentSlots} of {COMPOSER_MAX_ATTACHMENT_COUNT} slots left
              </Text>
            </View>
          </View>

          <View style={styles.attachOptions}>
            <Pressable
              style={[styles.attachOption, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
              onPress={() => void runAttachmentAction(chooseImage)}
            >
              <View style={[styles.attachOptionIcon, { backgroundColor: '#dbeafe' }]}>
                <ImageIcon color="#2563eb" size={22} />
              </View>
              <View style={styles.attachOptionCopy}>
                <Text style={[styles.attachOptionTitle, { color: colors.text }]}>Photos & videos</Text>
                <Text style={[styles.attachOptionBody, { color: colors.textSecondary }]}>Choose from your library</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.attachOption, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
              onPress={() => void runAttachmentAction(chooseCamera)}
            >
              <View style={[styles.attachOptionIcon, { backgroundColor: '#fce7f3' }]}>
                <Camera color="#db2777" size={22} />
              </View>
              <View style={styles.attachOptionCopy}>
                <Text style={[styles.attachOptionTitle, { color: colors.text }]}>Camera</Text>
                <Text style={[styles.attachOptionBody, { color: colors.textSecondary }]}>Take a photo or short video</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.attachOption, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
              onPress={() => void runAttachmentAction(chooseDocument)}
            >
              <View style={[styles.attachOptionIcon, { backgroundColor: '#ecfdf5' }]}>
                <FileText color="#059669" size={22} />
              </View>
              <View style={styles.attachOptionCopy}>
                <Text style={[styles.attachOptionTitle, { color: colors.text }]}>Document</Text>
                <Text style={[styles.attachOptionBody, { color: colors.textSecondary }]}>PDF, Word, Excel, and more</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </BottomSheet>

      <Modal visible={messengerModeOpen} transparent animationType="fade" onRequestClose={() => setMessengerModeOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMessengerModeOpen(false)}>
          <View style={[styles.modeSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modeSheetTitle, { color: colors.text }]}>Messenger messaging mode</Text>
            <Pressable
              style={[
                styles.modeOption,
                { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder },
                messengerMessagingMode === 'STANDARD' && (isDark ? styles.modeOptionActiveDark : styles.modeOptionActive),
                !canSendStandardMessage && styles.modeOptionDisabled,
              ]}
              disabled={!canSendStandardMessage}
              onPress={() => {
                onMessengerMessagingModeChange?.('STANDARD');
                setMessengerModeOpen(false);
              }}
            >
              <Text style={[styles.modeOptionTitle, { color: colors.text }]}>Standard</Text>
              <Text style={[styles.modeOptionBody, { color: colors.textSecondary }]}>Normal reply within 24 hours</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modeOption,
                { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder },
                messengerMessagingMode === 'HUMAN_AGENT' && (isDark ? styles.modeOptionActiveDark : styles.modeOptionActive),
                !canSendHumanAgentMessage && styles.modeOptionDisabled,
              ]}
              disabled={!canSendHumanAgentMessage}
              onPress={() => {
                onMessengerMessagingModeChange?.('HUMAN_AGENT');
                setMessengerModeOpen(false);
              }}
            >
              <Text style={[styles.modeOptionTitle, { color: colors.text }]}>Human Agent</Text>
              <Text style={[styles.modeOptionBody, { color: colors.textSecondary }]}>Manual, non-promotional support reply within 7 days</Text>
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
  messengerModeChipText: { fontSize: 12, fontWeight: '700' },
  modeSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 8,
    padding: 16,
  },
  modeSheetTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  modeOption: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modeOptionActive: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  modeOptionActiveDark: { backgroundColor: 'rgba(59,130,246,0.22)', borderColor: '#60a5fa' },
  modeOptionDisabled: { opacity: 0.45 },
  modeOptionTitle: { fontSize: 14, fontWeight: '700' },
  modeOptionBody: { fontSize: 12, marginTop: 3 },
  spacer: { flex: 1 },
  send: { alignItems: 'center', backgroundColor: '#b9dafa', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  sendActive: { backgroundColor: '#2563eb' },
  sendDisabled: { opacity: 0.7 },
  attachmentScroll: { marginBottom: 8, maxHeight: 96 },
  attachmentRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 2 },
  attachment: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#cfe0fa',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 220,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 8,
  },
  attachmentMedia: {
    backgroundColor: '#e8eef7',
    borderRadius: 14,
    height: 76,
    overflow: 'hidden',
    width: 76,
  },
  attachmentThumb: { height: '100%', width: '100%' },
  attachmentMediaBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 10,
    bottom: 6,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    width: 20,
  },
  attachmentIconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  attachmentCopy: { flexShrink: 1, maxWidth: 130 },
  attachmentName: { color: '#334155', fontSize: 13, fontWeight: '600' },
  attachmentMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  attachmentRemove: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
  },
  attachmentChipRemove: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  attachmentRemoveText: { color: '#fff', fontSize: 14, lineHeight: 16 },
  close: { color: '#64748b', fontSize: 22, marginLeft: 10 },
  attachSheet: { gap: 14, paddingHorizontal: 16, paddingTop: 8 },
  attachSheetHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  attachSheetTitle: { fontSize: 17, fontWeight: '800' },
  attachSheetSubtitle: { fontSize: 12, marginTop: 2 },
  attachOptions: { gap: 10, paddingBottom: 8 },
  attachOption: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  attachOptionIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  attachOptionCopy: { flex: 1, minWidth: 0 },
  attachOptionTitle: { fontSize: 15, fontWeight: '700' },
  attachOptionBody: { fontSize: 12, marginTop: 2 },
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
  pickerPanel: { padding: 16 },
  pickerHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  closeBtn: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 18, height: 34, justifyContent: 'center', width: 34 },
  pickerTitle: { color: '#17233a', fontSize: 15, fontWeight: '700' },
  pickerCount: { backgroundColor: '#eef4ff', borderRadius: 10, color: '#2563eb', fontSize: 11, paddingHorizontal: 6, paddingVertical: 2 },
  pickerSearch: { backgroundColor: '#f5f5f5', borderRadius: 10, color: '#17233a', height: 42, marginTop: 12, paddingHorizontal: 12 },
  pickerList: { flexGrow: 0, marginTop: 6, maxHeight: 480 },
  pickerError: { color: '#64748b', fontSize: 13, paddingVertical: 18, textAlign: 'center' },
  pickerRow: { alignItems: 'center', borderBottomColor: '#eef2f7', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 10 },
  pickerRowMain: { flex: 1, minWidth: 0 },
  pickerThumb: { borderRadius: 10, height: 48, width: 48 },
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
  replyTypeRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 2 },
  replyText: { color: '#64748b', flex: 1, fontSize: 12 },
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
