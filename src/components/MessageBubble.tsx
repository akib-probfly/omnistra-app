// @ts-nocheck
import { Check, CheckCheck, Megaphone, FileText, Play, ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthenticatedImage } from './AuthenticatedImage';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import {
  isEmojiOnlyMessage,
  parseMessageTextParts,
  getOutboundStatusMeta,
  isMessageEdited,
  getMessageFailureReason,
  getTemplateMessageDisplay,
  isTemplateLikeMessage,
  getSystemMessageLabel,
  isMissedCall,
  formatMessageTime,
} from '../lib/inbox-utils';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const LONG_TEXT_THRESHOLD = 180;

function openLink(href?: string) {
  if (!href) return;
  Linking.openURL(href).catch(() => {});
}

export function MessageBubble({ message, outgoing, attachments, replyPreview, reactions, onImage, onLongPress, onReplyPress }: any) {
  const isSystem = message.senderType === 'SYSTEM' && !message.campaignId;
  if (isSystem) {
    const missed = isMissedCall(message);
    const timestamp = message.sentAt ?? message.createdAt;
    return (
      <View style={styles.systemWrap}>
        <View style={[styles.systemPill, missed && styles.systemPillMissed]}>
          <View style={[styles.systemIconCircle, missed && styles.systemIconCircleMissed]}>
            <Check color={missed ? '#f59e0b' : '#3b82f6'} size={12} />
          </View>
          <Text style={[styles.systemText, missed && styles.systemTextMissed]}>{getSystemMessageLabel(message)}</Text>
          <Text style={styles.systemTime}>{formatMessageTime(timestamp)}</Text>
        </View>
      </View>
    );
  }

  const mediaType = (message.type ?? '').toUpperCase();
  const imageAttachments = (attachments ?? []).filter((a: any) => a.mediaType === 'IMAGE' || a.mediaType === 'STICKER' || (a.mimeType ?? '').startsWith('image/'));
  const voiceAttachments = (attachments ?? []).filter((a: any) => a.mediaType === 'VOICE' || a.mediaType === 'AUDIO');
  const videoAttachments = (attachments ?? []).filter((a: any) => a.mediaType === 'VIDEO' || (a.mimeType ?? '').startsWith('video/'));
  const documentAttachments = (attachments ?? []).filter((a: any) => !imageAttachments.includes(a) && !voiceAttachments.includes(a) && !videoAttachments.includes(a));

  const templateDisplay = isTemplateLikeMessage(message) ? getTemplateMessageDisplay(message) : null;
  const body = (message.text ?? '').trim();
  const showBody = templateDisplay ? false : body.length > 0;
  const statusMeta = outgoing ? getOutboundStatusMeta(message.deliveryStatus) : null;
  const edited = isMessageEdited(message);
  const failedReason = outgoing && statusMeta?.showFailed ? getMessageFailureReason(message) : null;
  const [expanded, setExpanded] = useState(false);

  function renderBody() {
    if (!body) return null;
    if (isEmojiOnlyMessage(body)) {
      return <Text style={[styles.emojiOnly, outgoing && styles.outgoingText]}>{body}</Text>;
    }
    const parts = parseMessageTextParts(body);
    const shouldTruncate = body.length > LONG_TEXT_THRESHOLD && !expanded;
    return (
      <View>
        <Text style={outgoing ? styles.outgoingText : styles.messageText}>
          {parts.map((part, index) => part.type === 'url' ? (
            <Text key={index} style={[styles.link, outgoing && styles.outgoingLink]} onPress={() => openLink(part.href)}>{part.value}</Text>
          ) : (
            <Text key={index}>{part.value}</Text>
          ))}
        </Text>
        {body.length > LONG_TEXT_THRESHOLD ? (
          <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
            <Text style={[styles.readMore, outgoing && styles.outgoingLink]}>{expanded ? 'Read less' : 'Read more'}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350}>
      <View style={[styles.bubble, outgoing ? styles.outgoing : styles.incoming]}>
        {message.campaignId ? (
          <View style={styles.broadcastRow}>
            <Megaphone color={outgoing ? '#cfe0ff' : '#2563eb'} size={12} />
            <Text style={[styles.broadcastText, outgoing && styles.outgoingMuted]}>{message.campaignName || 'Broadcast'}</Text>
          </View>
        ) : null}
        {replyPreview ? (
          <Pressable disabled={!onReplyPress} onPress={() => onReplyPress?.()} hitSlop={4} style={({ pressed }) => pressed && onReplyPress ? styles.quotedPressed : undefined}>
            <View style={[styles.quoted, !outgoing && styles.quotedIncoming]}>
              <Text style={[styles.quotedName, !outgoing && styles.quotedNameIncoming]}>{replyPreview.name}</Text>
              <View style={styles.quotedRow}>
                {replyPreview.imageUrl ? <AuthenticatedImage url={replyPreview.imageUrl} style={styles.quotedThumb} /> : null}
                <Text numberOfLines={1} style={[styles.quotedText, !outgoing && styles.quotedTextIncoming]}>{replyPreview.text ?? 'Attachment'}</Text>
              </View>
            </View>
          </Pressable>
        ) : null}
        {templateDisplay ? (
          <View>
            <View style={styles.templateHeaderRow}>
              <Text style={styles.templateHeaderText}>Template</Text>
            </View>
            {templateDisplay.headerText ? <Text style={[styles.templateHeader, outgoing && styles.outgoingText]}>{templateDisplay.headerText}</Text> : null}
            {templateDisplay.bodyText ? <Text style={outgoing ? styles.outgoingText : styles.messageText}>{templateDisplay.bodyText}</Text> : null}
            {templateDisplay.footerText ? <Text style={[styles.templateFooter, outgoing && styles.outgoingMuted]}>{templateDisplay.footerText}</Text> : null}
            {templateDisplay.buttons.length ? (
              <View style={styles.templateButtons}>
                {templateDisplay.buttons.map((button: any, index: number) => (
                  <Pressable
                    key={index}
                    style={[styles.templateButton, outgoing && styles.templateButtonOutgoing]}
                    onPress={() => { if (button.type === 'URL' && button.url) openLink(button.url); }}
                  >
                    <Text style={[styles.templateButtonText, outgoing && styles.templateButtonTextOutgoing]}>{button.label}</Text>
                    {button.type === 'URL' ? <ExternalLink color={outgoing ? '#cfe0ff' : '#2563eb'} size={12} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {imageAttachments.length > 1 ? (
          <View style={styles.imageGrid}>
            {imageAttachments.map((attachment: any) => (
              <AuthenticatedImage key={attachment.id} url={previewUrl(attachment)} style={styles.gridImage} onPress={() => onImage?.(attachment.id)} adaptive />
            ))}
          </View>
        ) : imageAttachments.length === 1 ? (
          <AuthenticatedImage url={previewUrl(imageAttachments[0])} style={styles.image} onPress={() => onImage?.(imageAttachments[0].id)} />
        ) : null}
        {videoAttachments.map((attachment: any) => (
          <View key={attachment.id} style={styles.videoCard}>
            {previewUrl(attachment) ? <AuthenticatedImage url={previewUrl(attachment)} style={styles.videoPoster} /> : <View style={[styles.videoPoster, styles.videoFallback]} />}
            <View style={styles.videoOverlay}>
              <View style={styles.playCircle}><Play color="#fff" fill="#fff" size={18} /></View>
            </View>
            {attachment.originalName ? <Text numberOfLines={1} style={styles.videoName}>{attachment.originalName}</Text> : null}
          </View>
        ))}
        {voiceAttachments.length ? (
          <View style={styles.voiceWrap}>
            {voiceAttachments.map((attachment: any) => (
              <VoiceNotePlayer key={attachment.id} url={audioUrl(attachment)} outgoing={outgoing} durationMs={attachment.durationMs} />
            ))}
          </View>
        ) : null}
        {documentAttachments.length ? (
          <View style={styles.docList}>
            {documentAttachments.map((attachment: any) => (
              <View key={attachment.id} style={styles.file}>
                <FileText color={outgoing ? '#cfe0ff' : '#2563eb'} size={18} />
                <Text numberOfLines={1} style={[styles.fileName, outgoing && styles.outgoingMuted]}>{attachment.originalName ?? attachment.mediaType ?? 'Document'}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {showBody ? renderBody() : null}
        <View style={styles.metaRow}>
          {outgoing && statusMeta ? (
            <Text style={[styles.status, statusMeta.showFailed && styles.statusFailed, statusMeta.showRead && styles.statusSeen]}>
              {statusMeta.showRead ? <CheckCheck color="#7dd3fc" size={13} /> : statusMeta.showDelivered ? <CheckCheck color="#dbeafe" size={13} /> : statusMeta.showSingleTick ? <Check color="#dbeafe" size={13} /> : null}
              {' '}{statusMeta.label}
            </Text>
          ) : null}
          <View style={styles.metaRight}>
            {message.sentAt ? (
              <Text style={[styles.status, outgoing ? styles.outgoingMuted : styles.incomingTime]}>
                {outgoing && message.sender?.userName ? `${message.sender.userName}  ` : ''}
                {new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            ) : outgoing && message.sender?.userName ? (
              <Text style={[styles.status, styles.outgoingMuted]}>{message.sender.userName}</Text>
            ) : null}
            {edited ? <Text style={[styles.editedChip, outgoing ? styles.editedOutgoing : styles.editedIncoming]}>Edited</Text> : null}
          </View>
        </View>
        {failedReason ? (
          <Text style={styles.failedText}>Failed to send: {failedReason}</Text>
        ) : null}
        {reactions && reactions.length ? (
          <View style={styles.reactionRow}>
            {reactions.map((reaction: any) => (
              <View key={reaction.emoji} style={styles.reactionPill}>
                <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                {reaction.count > 1 ? <Text style={[styles.reactionCount, outgoing && styles.reactionCountOutgoing]}>{reaction.count}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function previewUrl(attachment: any): string {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://osaas-mvp-api.probfly.com/api/v1';
  const value = attachment.previewUrl ?? attachment.thumbnailUrl ?? attachment.downloadUrl;
  return resolveMediaUrl(base, value);
}

function audioUrl(attachment: any): string {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://osaas-mvp-api.probfly.com/api/v1';
  return resolveMediaUrl(base, attachment.downloadUrl ?? attachment.previewUrl ?? attachment.thumbnailUrl);
}

function resolveMediaUrl(base: string, value?: string): string {
  if (!value) return '';
  try {
    const parsed = new URL(value, `${base}/`);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) {
      const apiBase = new URL(base);
      return `${apiBase.origin}${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return `${base.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
  }
}

const styles = StyleSheet.create({
  systemWrap: { alignItems: 'center', alignSelf: 'stretch' },
  systemPill: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderColor: '#e0f2fe', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 6, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8 },
  systemPillMissed: { backgroundColor: 'rgba(255,255,255,0.85)', borderColor: '#fef3c7' },
  systemIconCircle: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 10, height: 20, justifyContent: 'center', width: 20 },
  systemIconCircleMissed: { backgroundColor: '#fffbeb' },
  systemText: { color: '#475569', fontSize: 12, fontWeight: '500' },
  systemTextMissed: { color: '#d97706' },
  systemTime: { color: '#94a3b8', fontSize: 11 },
  bubble: { borderRadius: 18, maxWidth: '82%', padding: 13 },
  incoming: { backgroundColor: '#fff', borderColor: '#cfe0fa', borderWidth: 1 },
  outgoing: { backgroundColor: '#3264f6' },
  messageText: { color: '#334155', fontSize: 15 },
  outgoingText: { color: '#fff', fontSize: 15 },
  emojiOnly: { fontSize: 44, lineHeight: 52 },
  link: { color: '#2563eb', textDecorationLine: 'underline' },
  outgoingLink: { color: '#eaf1ff' },
  readMore: { color: '#2563eb', fontSize: 12, marginTop: 4, fontWeight: '600' },
  broadcastRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginBottom: 4 },
  broadcastText: { color: '#2563eb', fontSize: 11, fontWeight: '700' },
  outgoingMuted: { color: '#dbeafe' },
  quoted: { backgroundColor: '#ffffff22', borderColor: '#ffffff55', borderRadius: 12, borderWidth: 1, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 7, width: '100%' },
  quotedPressed: { opacity: 0.6 },
  quotedIncoming: { backgroundColor: '#f1f5f9', borderColor: '#dbe4f1' },
  quotedName: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  quotedNameIncoming: { color: '#2563eb' },
  quotedRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 5 },
  quotedThumb: { borderRadius: 6, height: 40, width: 40 },
  quotedText: { color: '#eef2ff', flex: 1, fontSize: 12 },
  quotedTextIncoming: { color: '#526987' },
  templateHeaderRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 4 },
  templateHeaderText: { color: '#2563eb', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  templateHeader: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  templateFooter: { color: '#64748b', fontSize: 12, marginTop: 6 },
  templateButtons: { gap: 6, marginTop: 10 },
  templateButton: { alignItems: 'center', borderColor: '#cfe0fa', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  templateButtonOutgoing: { borderColor: '#ffffff44' },
  templateButtonText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  templateButtonTextOutgoing: { color: '#eaf1ff' },
  image: { borderRadius: 18, height: 190, width: 250 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, borderRadius: 18, overflow: 'hidden', width: 250 },
  gridImage: { width: 123, height: 123 },
  videoCard: { borderRadius: 18, overflow: 'hidden', width: 250 },
  videoPoster: { height: 160, width: 250 },
  videoFallback: { backgroundColor: '#0f172a' },
  videoOverlay: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  playCircle: { alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.55)', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  videoName: { color: '#64748b', fontSize: 11, paddingHorizontal: 8, paddingVertical: 4 },
  voiceWrap: { gap: 6, maxWidth: 260 },
  docList: { gap: 6 },
  file: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 2 },
  fileName: { color: '#17233a', flex: 1, fontSize: 14 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 6 },
  metaRight: { alignItems: 'center', flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  status: { color: '#dbeafe', fontSize: 11 },
  statusSeen: { color: '#7dd3fc' },
  statusFailed: { color: '#fda4af' },
  incomingTime: { color: '#94a3b8' },
  editedChip: { borderRadius: 999, fontSize: 9, paddingHorizontal: 6, paddingVertical: 1 },
  editedOutgoing: { borderColor: '#ffffff33', borderWidth: 1, color: '#dbeafe' },
  editedIncoming: { borderColor: '#dbe4f1', borderWidth: 1, color: '#64748b' },
  failedText: { color: '#fda4af', fontSize: 11, marginTop: 4 },
  reactionRow: { flexDirection: 'row', gap: 5, position: 'absolute', bottom: 3, left: -8 },
  reactionPill: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingHorizontal: 3, paddingVertical: 0 },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  reactionCountOutgoing: { color: '#dbeafe' },
});
