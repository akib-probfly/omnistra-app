const EMOJI_ONLY_MESSAGE_PATTERN = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u200d|\ufe0f|\s)+$/u;

export type MessageLike = {
  id: string;
  direction?: string;
  senderType?: string | null;
  type?: string;
  text?: string | null;
  deliveryStatus?: string;
  failureReason?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  replyToMessageId?: string | null;
  replyTo?: { sender?: { userName?: string | null; displayName?: string | null } | null; text?: string | null } | null;
  senderWorkspaceMemberId?: string | null;
  sentAt?: string | null;
  createdAt?: string;
  metadata?: any;
  attachments?: Array<{ id: string; mediaType: string; mimeType?: string | null; originalName?: string | null; caption?: string | null; previewUrl?: string | null; thumbnailUrl?: string | null; downloadUrl?: string; durationMs?: number | null }>;
};

export function isEmojiOnlyMessage(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  const emojiMatches = trimmed.match(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu) ?? [];
  if (emojiMatches.length === 0 || emojiMatches.length > 3) return false;
  return EMOJI_ONLY_MESSAGE_PATTERN.test(trimmed);
}

export const ATTACHMENT_ONLY_PLACEHOLDERS = new Set(['[image]', '[video]', '[audio]', '[voice note]', '[document]', '[location]', '[sticker]', '[reaction]', '[template]', '[attachment]']);

export type MessageTextPart = { type: 'text' | 'url'; value: string; href?: string };
const URL_PATTERN = /(^|[^\w@])((?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/[\w!#%&'()*+,./:;=?@~-]*)?)/gi;

export function parseMessageTextParts(text: string): MessageTextPart[] {
  const parts: MessageTextPart[] = [];
  const regex = new RegExp(URL_PATTERN.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const leading = match[1] ?? '';
    const rawUrl = match[2];
    if (!rawUrl) { lastIndex = regex.lastIndex; continue; }
    const start = match.index + leading.length;
    if (start > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, start) });
    if (leading) parts.push({ type: 'text', value: leading });
    const hasScheme = /^https?:\/\//i.test(rawUrl);
    const href = hasScheme ? rawUrl : `https://${rawUrl}`;
    parts.push({ type: 'url', value: rawUrl, href });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  if (parts.length === 0) parts.push({ type: 'text', value: text });
  return parts;
}

export function isSameCalendarDay(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function formatTimelineDayLabel(value: string | Date): string {
  const d = new Date(value);
  return d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatMessageTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export type OutboundStatusMeta = { showQueued: boolean; showFailed: boolean; showSingleTick: boolean; showDelivered: boolean; showRead: boolean; label: string };
export function getOutboundStatusMeta(deliveryStatus?: string): OutboundStatusMeta {
  switch (deliveryStatus) {
    case 'QUEUED': return { showQueued: true, showFailed: false, showSingleTick: true, showDelivered: false, showRead: false, label: 'Sent' };
    case 'SENT': return { showQueued: false, showFailed: false, showSingleTick: true, showDelivered: false, showRead: false, label: 'Sent' };
    case 'DELIVERED': return { showQueued: false, showFailed: false, showSingleTick: false, showDelivered: true, showRead: false, label: 'Delivered' };
    case 'READ': return { showQueued: false, showFailed: false, showSingleTick: false, showDelivered: false, showRead: true, label: 'Seen' };
    case 'FAILED': return { showQueued: false, showFailed: true, showSingleTick: false, showDelivered: false, showRead: false, label: 'Failed' };
    default: return { showQueued: false, showFailed: false, showSingleTick: false, showDelivered: false, showRead: false, label: '' };
  }
}

export function isMessageEdited(message: MessageLike): boolean {
  return Boolean(message.metadata?.providerEdit);
}

export function getMessageFailureReason(message: MessageLike): string | null {
  if (message.failureReason) return message.failureReason;
  const meta = message.metadata ?? {};
  const errorPayload = meta.responsePayload?.error;
  return meta.sendFailureReason ?? meta.errorMessage ?? meta.error ?? errorPayload?.message ?? errorPayload?.error_description ?? errorPayload?.errorMessage ?? null;
}

export function isInlineReactionMessage(message: MessageLike): boolean {
  return message.type === 'REACTION' && Boolean(message.replyToMessageId);
}

export type ReactionGroup = { emoji: string; count: number };
export function buildReactionGroups(messages: MessageLike[]): Record<string, ReactionGroup[]> {
  const byTarget = new Map<string, Map<string, Set<string>>>();
  messages.forEach((message) => {
    if (!isInlineReactionMessage(message) || !message.replyToMessageId) return;
    const emoji = message.text?.trim() || '👍';
    const actorKey = message.direction === 'INBOUND' ? `contact:${message.senderType ?? ''}` : `member:${message.senderWorkspaceMemberId ?? 'self'}`;
    if (!byTarget.has(message.replyToMessageId)) byTarget.set(message.replyToMessageId, new Map());
    const emojiMap = byTarget.get(message.replyToMessageId)!;
    if (!emojiMap.has(emoji)) emojiMap.set(emoji, new Set());
    emojiMap.get(emoji)!.add(actorKey);
  });
  const result: Record<string, ReactionGroup[]> = {};
  byTarget.forEach((emojiMap, targetId) => {
    result[targetId] = [...emojiMap.entries()].map(([emoji, actors]) => ({ emoji, count: actors.size }));
  });
  return result;
}

export type TemplateMessageButton = { label: string; type: string; url?: string | null };
export type TemplateMessageDisplay = { headerType?: string; headerText?: string; bodyText: string; footerText: string; buttons: TemplateMessageButton[] };

export function isTemplateLikeMessage(message: MessageLike): boolean {
  return message.type === 'TEMPLATE' || Boolean(message.metadata?.templateSnapshot);
}

export function getTemplateMessageDisplay(message: MessageLike): TemplateMessageDisplay | null {
  const snapshot = message.metadata?.templateSnapshot ?? {};
  const components = message.metadata?.templateSnapshot?.displayComponents ?? message.metadata?.templateSnapshot?.components ?? [];
  const buttons: TemplateMessageButton[] = [];
  let headerType = '';
  let headerText = '';
  let bodyText = '';
  let footerText = '';
  if (Array.isArray(components)) {
    components.forEach((component: any) => {
      const type = (component?.type ?? '').toUpperCase();
      if (type === 'HEADER') {
        headerType = component?.format ?? '';
        const params = component?.parameters ?? [];
        headerText = params.filter((p: any) => typeof p?.text === 'string').map((p: any) => p.text).join(' ');
        if (component?.location) headerText = `${component.location.name ?? ''} ${component.location.address ?? ''}`.trim();
      } else if (type === 'BODY') {
        const params = component?.parameters ?? [];
        bodyText = params.filter((p: any) => typeof p?.text === 'string').map((p: any) => p.text).join('');
      } else if (type === 'FOOTER') {
        const params = component?.parameters ?? [];
        footerText = params.filter((p: any) => typeof p?.text === 'string').map((p: any) => p.text).join('');
      } else if (type === 'BUTTONS') {
        const params = component?.parameters ?? [];
        params.forEach((p: any) => {
          if (p?.type === 'button' && p?.button) {
            buttons.push({ label: p.button.text ?? '', type: p.button.type ?? p.sub_type ?? 'QUICK_REPLY', url: p.button.url ?? null });
          }
        });
      }
    });
  }
  if (!bodyText && typeof snapshot.bodyText === 'string') bodyText = snapshot.bodyText;
  if (!headerText && typeof snapshot.headerText === 'string') headerText = snapshot.headerText;
  if (!footerText && typeof snapshot.footerText === 'string') footerText = snapshot.footerText;
  if (!headerType && typeof snapshot.headerType === 'string') headerType = snapshot.headerType;
  const buttonsJson = snapshot.buttonsJson ?? message.metadata?.templateSnapshot?.buttons;
  if (Array.isArray(buttonsJson) && buttonsJson.length && buttons.length === 0) {
    buttonsJson.forEach((b: any) => buttons.push({ label: b.text ?? b.label ?? '', type: b.type ?? 'QUICK_REPLY', url: b.url ?? null }));
  }
  if (!bodyText && !headerText && !footerText && buttons.length === 0) return null;
  return { headerType, headerText, bodyText, footerText, buttons };
}

export function formatCallDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function readSystemMessageDurationSeconds(message: MessageLike): number | null {
  const meta = message.metadata ?? {};
  const candidate = meta.callSession ?? meta.call ?? meta.payload ?? meta.rawWebhookCallItem;
  if (candidate) {
    if (typeof candidate.durationSeconds === 'number') return candidate.durationSeconds;
    if (typeof candidate.duration === 'number') return candidate.duration;
    if (candidate.start_time && candidate.end_time) {
      const diff = (new Date(candidate.end_time).getTime() - new Date(candidate.start_time).getTime()) / 1000;
      if (Number.isFinite(diff) && diff > 0) return diff;
    }
  }
  return null;
}

export function getSystemMessageLabel(message: MessageLike): string {
  const body = message.text?.trim() ?? '';
  if (body.toLowerCase() !== 'call ended') return body;
  const seconds = readSystemMessageDurationSeconds(message);
  return seconds != null ? `Call ended · ${formatCallDuration(seconds)}` : 'Call ended';
}

export function isMissedCall(message: MessageLike): boolean {
  return /missed call/i.test(message.text ?? '');
}

export function getConversationWindowLabel(conversation: { messaging?: { windowExpiresAt?: string | null; standardWindowExpiresAt?: string | null; humanAgentWindowExpiresAt?: string | null } } | undefined, now = new Date()): { label: string; tone: 'open' | 'expired' | 'none' } {
  const expiresAt = conversation?.messaging?.windowExpiresAt ?? conversation?.messaging?.standardWindowExpiresAt;
  if (!expiresAt) return { label: 'Open', tone: 'none' };
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return { label: 'Open', tone: 'none' };
  if (expires <= now) return { label: 'Window Expired', tone: 'expired' };
  const diffMs = expires.getTime() - now.getTime();
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 0) return { label: `${hours}h ${minutes}m left`, tone: 'open' };
  return { label: minutes > 0 ? `${minutes}m left` : 'Open', tone: 'open' };
}

export function getConversationTitle(conversation: { contact?: { displayName?: string | null; primaryPhone?: string | null } | null; channel?: { channelName?: string | null; displayPhoneNumber?: string | null } | null } | undefined, fallback = 'Unknown contact'): string {
  const title = conversation?.contact?.displayName ?? conversation?.contact?.primaryPhone ?? conversation?.channel?.displayPhoneNumber ?? conversation?.channel?.channelName;
  return title?.trim() ? title : fallback;
}

export function getMessageBody(message: MessageLike): string {
  if (isTemplateLikeMessage(message)) {
    const display = getTemplateMessageDisplay(message);
    if (display) {
      return [display.headerText, display.bodyText, display.footerText].filter(Boolean).join('\n\n');
    }
  }
  const metadata = message.metadata ?? {};
  const rendered = metadata.templateRenderedText ?? metadata.renderedText ?? metadata.bodyText;
  if (typeof rendered === 'string' && rendered.trim()) return rendered;
  if (message.text?.trim()) return message.text;
  const firstAttachment = message.attachments?.[0];
  if (firstAttachment?.caption?.trim()) return firstAttachment.caption;
  if (firstAttachment?.originalName) return firstAttachment.originalName;
  if (message.campaignName) return message.campaignName;
  const fallbackMap: Record<string, string> = { IMAGE: '[Image]', VIDEO: '[Video]', AUDIO: '[Audio]', VOICE: '[Voice note]', DOCUMENT: '[Document]', FILE: '[Document]', LOCATION: '[Location]', STICKER: '[Sticker]', REACTION: '[Reaction]', TEMPLATE: '[Template]' };
  return fallbackMap[(message.type ?? '').toUpperCase()] ?? '';
}
