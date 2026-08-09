import type { ConversationAssignmentEvent, ConversationAssignmentMember, ConversationCallSession } from '../api/inbox';

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

export function getInitials(value?: string | null): string {
  const parts = (value ?? '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]);
  return (parts.join('') || '?').toUpperCase();
}

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

export type OutboundStatusMeta = { showQueued: boolean; showSending: boolean; showFailed: boolean; showSingleTick: boolean; showDelivered: boolean; showRead: boolean; label: string };
export function getOutboundStatusMeta(deliveryStatus?: string): OutboundStatusMeta {
  switch (deliveryStatus) {
    case 'SENDING': return { showQueued: false, showSending: true, showFailed: false, showSingleTick: false, showDelivered: false, showRead: false, label: 'Sending' };
    case 'QUEUED': return { showQueued: true, showSending: false, showFailed: false, showSingleTick: true, showDelivered: false, showRead: false, label: 'Sent' };
    case 'SENT': return { showQueued: false, showSending: false, showFailed: false, showSingleTick: true, showDelivered: false, showRead: false, label: 'Sent' };
    case 'DELIVERED': return { showQueued: false, showSending: false, showFailed: false, showSingleTick: false, showDelivered: true, showRead: false, label: 'Delivered' };
    case 'READ': return { showQueued: false, showSending: false, showFailed: false, showSingleTick: false, showDelivered: false, showRead: true, label: 'Seen' };
    case 'FAILED': return { showQueued: false, showSending: false, showFailed: true, showSingleTick: false, showDelivered: false, showRead: false, label: 'Failed' };
    default: return { showQueued: false, showSending: false, showFailed: false, showSingleTick: false, showDelivered: false, showRead: false, label: '' };
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
export type TemplateMessageDisplay = { headerType?: string; headerText?: string; headerMediaUrl?: string | null; bodyText: string; footerText: string; buttons: TemplateMessageButton[]; category?: string | null; templateName?: string | null };

export function isTemplateLikeMessage(message: MessageLike): boolean {
  return message.type === 'TEMPLATE' || Boolean(message.metadata?.templateSnapshot);
}

function extractTemplateButtons(buttonsJson: unknown): TemplateMessageButton[] {
  if (!Array.isArray(buttonsJson)) return [];
  const result: TemplateMessageButton[] = [];
  for (const group of buttonsJson) {
    if (!group || !Array.isArray(group.buttons)) {
      if (group && (group.text || group.label)) {
        result.push({ label: group.text ?? group.label ?? '', type: group.type ?? null, url: group.url ?? null });
      }
      continue;
    }
    for (const button of group.buttons) {
      if (!button) continue;
      const label = button.text ?? button.label ?? button.payload;
      if (label) {
        result.push({ label, type: button.type ?? null, url: button.url ?? null });
      }
    }
  }
  return result;
}

export function getTemplateMessageDisplay(message: MessageLike): TemplateMessageDisplay | null {
  const snapshot = message.metadata?.templateSnapshot ?? {};
  const componentsSource = message.metadata?.templateComponents ?? message.metadata?.templateSnapshot?.displayComponents ?? message.metadata?.templateSnapshot?.components ?? [];
  const components = Array.isArray(componentsSource) ? componentsSource : [];
  const buttons: TemplateMessageButton[] = [];
  let headerType = '';
  let headerText = '';
  let headerMediaUrl: string | null = null;
  let bodyText = '';
  let footerText = '';
  const snapshotButtons = extractTemplateButtons(snapshot.buttonsJson ?? snapshot.buttons);
  let buttonIndex = 0;

  for (const component of components) {
    const type = (component?.type ?? '').toString().toLowerCase();
    if (type === 'header') {
      headerType = (component?.format ?? '').toString().toUpperCase();
      const params = component?.parameters ?? [];
      if (component?.location) {
        headerText = `${component.location.name ?? ''} ${component.location.address ?? ''}`.trim();
      } else {
        headerText = params.filter((p: any) => typeof p?.text === 'string').map((p: any) => p.text).join(' ');
      }
      const mediaParam = params.find((p: any) => p?.image || p?.video || p?.document);
      if (mediaParam) {
        headerMediaUrl = mediaParam.image?.link ?? mediaParam.video?.link ?? mediaParam.document?.link ?? null;
      }
    } else if (type === 'body') {
      const params = component?.parameters ?? [];
      bodyText = params.filter((p: any) => typeof p?.text === 'string').map((p: any) => p.text).join('');
    } else if (type === 'footer') {
      const params = component?.parameters ?? [];
      footerText = params.filter((p: any) => typeof p?.text === 'string').map((p: any) => p.text).join('');
    } else if (type === 'button') {
      const buttonType = component?.sub_type ?? component?.buttonType ?? component?.button_type;
      const params = Array.isArray(component?.parameters) ? component.parameters : [];
      const labels = params.map((p: any) => p?.text ?? p?.label ?? p?.payload).filter(Boolean);
      for (const label of labels) {
        const snapBtn = snapshotButtons[buttonIndex] ?? null;
        buttons.push({ label, type: buttonType ?? null, url: buttonType?.toString().toLowerCase() === 'url' ? (snapBtn?.url ?? null) : null });
        buttonIndex += 1;
      }
    } else if (type === 'buttons') {
      const params = Array.isArray(component?.parameters) ? component.parameters : [];
      params.forEach((p: any) => {
        if (p?.type === 'button' && p?.button) {
          buttons.push({ label: p.button.text ?? '', type: p.button.type ?? p.sub_type ?? 'QUICK_REPLY', url: p.button.url ?? null });
        } else if (p?.text || p?.label) {
          buttons.push({ label: p.text ?? p.label ?? '', type: p.sub_type ?? p.type ?? null, url: p.url ?? null });
        }
      });
    }
  }

  if (!bodyText && typeof snapshot.bodyText === 'string') bodyText = snapshot.bodyText;
  if (!headerText && typeof snapshot.headerText === 'string') headerText = snapshot.headerText;
  if (!footerText && typeof snapshot.footerText === 'string') footerText = snapshot.footerText;
  if (!headerType && typeof snapshot.headerType === 'string') headerType = snapshot.headerType;
  if (!headerMediaUrl && snapshot.headerMediaUrl) headerMediaUrl = snapshot.headerMediaUrl;
  if (!bodyText && !headerText && !footerText && !headerMediaUrl && buttons.length === 0) {
    const fallback = extractTemplateButtons(snapshot.buttonsJson ?? snapshot.buttons ?? message.metadata?.templateSnapshot?.buttonsJson);
    buttons.push(...fallback);
  }
  if (buttons.length === 0 && snapshotButtons.length > 0) {
    buttons.push(...snapshotButtons);
  }
  if (!bodyText && !headerText && !footerText && buttons.length === 0) return null;
  const category = snapshot.category ?? message.metadata?.templateCategory ?? null;
  const templateName = snapshot.templateName ?? message.metadata?.templateName ?? null;
  return { headerType, headerText, headerMediaUrl, bodyText, footerText, buttons, category, templateName };
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
  const durationLabel = formatCallDurationLabel(seconds);
  return durationLabel ? `Call ended · ${durationLabel}` : 'Call ended';
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

// --- Call history ---

export type CallHistoryTone = 'noAnswer' | 'permission' | 'permissionGranted' | 'permissionDenied' | 'permissionExpired' | 'ringing' | 'connected' | 'completed' | 'missed' | 'declined' | 'failed' | 'ended' | 'requested';

const TERMINAL_CALL_OUTCOME_PRIORITY = ['MISSED', 'REJECTED', 'FAILED', 'CANCELLED'] as const;
const ENDED_REASON_OUTCOME_RULES = [
  { outcome: 'MISSED', keywords: ['missed', 'no answer', 'not answered'] },
  { outcome: 'REJECTED', keywords: ['reject', 'declin'] },
  { outcome: 'CANCELLED', keywords: ['cancel'] },
  { outcome: 'FAILED', keywords: ['fail'] },
] as const;

export function formatCallDurationLabel(seconds: number | null): string | null {
  if (seconds === null || Number.isNaN(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(remaining).padStart(2, '0')}s`;
  return `${remaining}s`;
}

export function formatCallHistoryTime(value?: string | null): string {
  if (!value) return 'Now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Now';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCallOutcomeReason(reason: string | null): string | null {
  const trimmed = reason?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, ' ');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized) || /^wacid\./i.test(normalized) || /^wamid\./i.test(normalized)) return null;
  return normalized;
}

function formatDateTimeLabel(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function readStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => `${item}`.toUpperCase());
  return [`${value}`.toUpperCase()];
}

function resolveOutcomeByPriority(statuses: string[]): string | null {
  return (TERMINAL_CALL_OUTCOME_PRIORITY as readonly string[]).find((outcome) => statuses.includes(outcome)) ?? null;
}

function resolveOutcomeFromEndedReason(endedReason: string | null): string | null {
  const normalized = `${endedReason ?? ''}`.toLowerCase();
  for (const rule of ENDED_REASON_OUTCOME_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) return rule.outcome;
  }
  return null;
}

const LIVE_CALL_SESSION_STATUSES = new Set(['REQUESTED', 'PERMISSION_REQUESTED', 'RINGING', 'CONNECTED']);

export function isCallSessionTerminal(status: string): boolean {
  return ['ENDED', 'MISSED', 'REJECTED', 'FAILED', 'CANCELLED'].includes(status);
}

export function isLiveCallSession(session: Pick<ConversationCallSession, 'status' | 'endedAt'>) {
  return session.endedAt == null && LIVE_CALL_SESSION_STATUSES.has(session.status);
}

export function getCallSessionStatusLabel(
  status: ConversationCallSession['status'],
  permissionStatus?: ConversationCallSession['permissionStatus'],
  direction?: ConversationCallSession['direction'] | null,
) {
  switch (getNormalizedCallSessionOutcome(status, direction)) {
    case 'REQUESTED':
      return 'Call requested';
    case 'PERMISSION_REQUESTED':
      if (permissionStatus === 'GRANTED') return 'Permission granted';
      if (permissionStatus === 'DENIED') return 'Permission declined';
      return 'Waiting for approval';
    case 'RINGING':
      return 'Ringing';
    case 'CONNECTED':
      return 'In call';
    case 'ENDED':
      return 'Call ended';
    case 'MISSED':
      return 'Call missed';
    case 'REJECTED':
      return 'Call rejected';
    case 'FAILED':
      return 'Call failed';
    case 'CANCELLED':
      return 'Call cancelled';
    default:
      return status;
  }
}

/** Sidebar/list preview labels aligned with osaas-frontend `getCallSessionSidebarPreview`. */
export function getCallSessionSidebarPreview(session: ConversationCallSession): string {
  const status =
    session.endedAt !== null && !isCallSessionTerminal(session.status)
      ? 'ENDED'
      : inferCallOutcome(session);

  switch (status) {
    case 'MISSED':
      return 'Missed call';
    case 'REJECTED':
      return 'Call declined';
    case 'FAILED':
      return 'Call failed';
    case 'CANCELLED':
      return 'Call cancelled';
    case 'ENDED':
      return session.durationSeconds !== null
        ? `Call ended · ${formatCallDurationLabel(session.durationSeconds) ?? 'Live'}`
        : 'Call ended';
    case 'CONNECTED':
      return 'In call';
    case 'REQUESTED':
      return 'Call requested';
    case 'PERMISSION_REQUESTED':
      if (session.permissionStatus === 'GRANTED') return 'Permission granted';
      if (session.permissionStatus === 'DENIED') return 'Permission declined';
      return 'Waiting for approval';
    case 'RINGING':
      return 'Ringing';
    default:
      return 'Call update';
  }
}

export type VoiceCallButtonState = {
  canStartVoiceCall: boolean;
  tooltipMessage: string;
};

export function getVoiceCallButtonState(input: {
  isWhatsAppConversation: boolean;
  canManageCalls: boolean;
  isCallSessionsLoading: boolean;
  isCallControllerBusy: boolean;
  activeCallSession: ConversationCallSession | null;
  latestCallSession: ConversationCallSession | null;
  businessCallingStatus?: 'PENDING' | 'ENABLED' | 'FAILED' | 'DISABLED' | null;
  businessCallingDisabledReason?: string | null;
}): VoiceCallButtonState {
  if (input.isCallSessionsLoading) {
    return { canStartVoiceCall: false, tooltipMessage: 'Loading call status...' };
  }
  if (!input.isWhatsAppConversation) {
    return { canStartVoiceCall: false, tooltipMessage: 'Voice calls are only available for WhatsApp conversations right now.' };
  }
  if (!input.canManageCalls) {
    return { canStartVoiceCall: false, tooltipMessage: 'You do not have permission to start voice calls.' };
  }
  if (input.businessCallingDisabledReason) {
    return { canStartVoiceCall: false, tooltipMessage: input.businessCallingDisabledReason };
  }
  if (input.businessCallingStatus === 'DISABLED') {
    return { canStartVoiceCall: false, tooltipMessage: 'Business calling is disabled for this WhatsApp number.' };
  }
  if (input.isCallControllerBusy) {
    return { canStartVoiceCall: false, tooltipMessage: 'Preparing the call...' };
  }
  if (input.activeCallSession) {
    return { canStartVoiceCall: false, tooltipMessage: 'A voice call is already active in this conversation.' };
  }
  if (input.latestCallSession?.status === 'PERMISSION_REQUESTED') {
    if (input.latestCallSession.permissionStatus === 'GRANTED') {
      return { canStartVoiceCall: true, tooltipMessage: 'Permission granted. Start a voice call.' };
    }
    return { canStartVoiceCall: false, tooltipMessage: 'Permission message sent. Waiting for customer confirmation.' };
  }
  return { canStartVoiceCall: true, tooltipMessage: 'Start a voice call' };
}

export function getNormalizedCallSessionOutcome(status: string, direction?: ConversationCallSession['direction'] | null): string {
  if (direction === 'INBOUND' && status === 'CANCELLED') return 'MISSED';
  return status;
}

function inferCallOutcome(session: ConversationCallSession): string {
  let outcome: string = session.status;
  if (session.status === 'ENDED') {
    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    const rawCallItem = metadata.rawCallItem as Record<string, unknown> | null;
    const rawWebhook = metadata.rawWebhook as Record<string, unknown> | null;
    const rawStatusOutcome = resolveOutcomeByPriority(readStringArray(rawCallItem?.status));
    if (rawStatusOutcome) {
      outcome = rawStatusOutcome;
    } else {
      const webhookOutcome = resolveOutcomeByPriority([`${rawWebhook?.status ?? ''}`.toUpperCase()]);
      if (webhookOutcome) {
        outcome = webhookOutcome;
      } else {
        const endedReasonOutcome = resolveOutcomeFromEndedReason(session.endedReason);
        if (endedReasonOutcome) {
          outcome = endedReasonOutcome;
        } else if (session.durationSeconds !== null) {
          outcome = 'CONNECTED';
        } else {
          outcome = 'ENDED';
        }
      }
    }
  }
  return getNormalizedCallSessionOutcome(outcome, session.direction);
}

export function getCallSessionHistoryPresentation(session: ConversationCallSession, variant: 'session' | 'permission' = 'session'): { tone: CallHistoryTone; title: string; body: string; detail: string | null } {
  if (variant === 'permission' || session.status === 'PERMISSION_REQUESTED') {
    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    const permissionExpirationTimestamp = typeof metadata.permissionExpirationTimestamp === 'string' ? metadata.permissionExpirationTimestamp : null;
    const permissionIsPermanent = metadata.permissionIsPermanent === true;
    const permissionExpiresLabel = formatDateTimeLabel(permissionExpirationTimestamp);

    if (session.permissionStatus === 'GRANTED') {
      return {
        tone: 'permissionGranted',
        title: 'Permission granted',
        body: permissionIsPermanent ? 'Customer granted permanent call permission' : 'Customer granted call permission',
        detail: permissionIsPermanent ? 'Permission does not expire until revoked' : permissionExpiresLabel ? `Valid until ${permissionExpiresLabel}` : null,
      };
    }
    if (session.permissionStatus === 'DENIED') {
      return { tone: 'permissionDenied', title: 'Permission declined', body: 'Customer rejected the call permission request', detail: formatCallOutcomeReason(session.endedReason) };
    }
    if (session.permissionStatus === 'EXPIRED') {
      return { tone: 'permissionExpired', title: 'Permission expired', body: 'Call permission request expired', detail: permissionExpiresLabel ? `Expired on ${permissionExpiresLabel}` : null };
    }
    return { tone: 'permission', title: 'Waiting for approval', body: session.permissionStatus === 'REQUESTED' ? 'Customer approval request sent' : 'Customer approval is pending', detail: null };
  }

  const outcome = session.endedAt !== null && !isCallSessionTerminal(session.status) ? 'ENDED' : inferCallOutcome(session);

  switch (outcome) {
    case 'REQUESTED':
      return {
        tone: 'requested',
        title: 'Call requested',
        body: session.direction === 'INBOUND' ? 'Inbound call session created' : 'Outbound call session created',
        detail: null,
      };
    case 'PERMISSION_REQUESTED':
      return { tone: 'permission', title: 'Waiting for approval', body: session.permissionStatus === 'REQUESTED' ? 'Customer approval request sent' : 'Customer approval is pending', detail: null };
    case 'RINGING':
      return { tone: 'ringing', title: 'Ringing', body: session.direction === 'INBOUND' ? 'Customer is calling in' : 'Outbound call is ringing', detail: null };
    case 'CONNECTED':
      return { tone: 'connected', title: 'Accepted call', body: 'Call connected', detail: session.durationSeconds !== null ? `Connected for ${formatCallDurationLabel(session.durationSeconds)}` : null };
    case 'MISSED':
      return {
        tone: 'missed',
        title: 'Missed call',
        body: 'No answer',
        detail: formatCallOutcomeReason(session.endedReason) ?? (session.direction === 'INBOUND' ? `Missed from ${session.recipientDisplayName ?? session.recipientIdentityValue}` : `Missed to ${session.recipientDisplayName ?? session.recipientIdentityValue}`),
      };
    case 'REJECTED':
      return { tone: 'declined', title: 'Call declined', body: 'Rejected before connecting', detail: formatCallOutcomeReason(session.endedReason) ?? `Declined by ${session.recipientDisplayName ?? session.recipientIdentityValue}` };
    case 'FAILED':
      return { tone: 'failed', title: 'Call failed', body: session.endedReason ?? 'Could not connect', detail: formatCallOutcomeReason(session.endedReason) };
    case 'CANCELLED':
      return { tone: 'ended', title: 'Call cancelled', body: session.endedReason ?? 'Cancelled before connection', detail: formatCallOutcomeReason(session.endedReason) };
    case 'ENDED':
    default: {
      const reason = formatCallOutcomeReason(session.endedReason);
      const detail = reason && reason !== 'Call ended' ? reason : null;
      return {
        tone: session.durationSeconds !== null ? 'completed' : 'ended',
        title: session.durationSeconds !== null ? 'Accepted call' : 'Call ended',
        body: session.durationSeconds !== null ? `Connected for ${formatCallDurationLabel(session.durationSeconds)}` : 'Ended',
        detail,
      };
    }
  }
}

export function getCallSessionTimelineTimestamp(session: ConversationCallSession, variant: 'session' | 'permission' = 'session'): string {
  if (variant === 'permission' || session.status === 'PERMISSION_REQUESTED') {
    return session.permissionRespondedAt ?? session.requestedPermissionAt ?? session.createdAt;
  }
  return session.endedAt ?? session.permissionRespondedAt ?? session.connectedAt ?? session.startedAt ?? session.requestedPermissionAt ?? session.createdAt;
}

export function getCallDisplayTone(session: ConversationCallSession | null, tone: CallHistoryTone, outcomeLabel: string): CallHistoryTone {
  if (outcomeLabel === 'No answer') return 'noAnswer';
  if (outcomeLabel === 'Missed') return 'missed';
  if (outcomeLabel === 'Declined') return 'declined';
  if (outcomeLabel === 'Connected' || outcomeLabel.startsWith('Connected')) {
    return session?.direction === 'INBOUND' ? 'connected' : 'completed';
  }
  return tone;
}

export function getCallOutcomeLabel(session: ConversationCallSession | null, tone: CallHistoryTone, presentationTitle: string, durationLabel: string | null): string {
  const isInbound = session?.direction === 'INBOUND';
  const isOutbound = session?.direction === 'OUTBOUND';
  const connectedLabel = durationLabel ? `Connected · ${durationLabel}` : 'Connected';
  if (presentationTitle === 'Call cancelled') return 'Cancelled';
  switch (tone) {
    case 'connected':
    case 'completed':
      return connectedLabel;
    case 'ended':
      if (durationLabel) return connectedLabel;
      if (isInbound) return 'Missed';
      if (isOutbound) return 'No answer';
      return presentationTitle;
    case 'missed':
      return isOutbound ? 'No answer' : 'Missed';
    case 'declined':
      return 'Declined';
    case 'ringing':
      return 'Ringing';
    default:
      return presentationTitle;
  }
}

export function getCallAgentLabel(session: ConversationCallSession | null): string | null {
  if (!session) return null;
  if (session.direction === 'INBOUND') {
    return session.claimedBy?.userName?.trim() ?? session.claimedBy?.userEmail?.trim() ?? session.initiatedBy?.userName?.trim() ?? session.initiatedBy?.userEmail?.trim() ?? null;
  }
  return session.initiatedBy?.userName?.trim() ?? session.initiatedBy?.userEmail?.trim() ?? session.claimedBy?.userName?.trim() ?? session.claimedBy?.userEmail?.trim() ?? null;
}

const CALL_TONE_STYLES: Record<CallHistoryTone, { text: string; iconBg: string; iconColor: string }> = {
  noAnswer: { text: '#d97706', iconBg: '#fffbeb', iconColor: '#d97706' },
  permission: { text: '#d97706', iconBg: '#fffbeb', iconColor: '#d97706' },
  permissionGranted: { text: '#059669', iconBg: '#ecfdf5', iconColor: '#059669' },
  permissionDenied: { text: '#e11d48', iconBg: '#fff1f2', iconColor: '#e11d48' },
  permissionExpired: { text: '#d97706', iconBg: '#fffbeb', iconColor: '#d97706' },
  ringing: { text: '#0284c7', iconBg: '#f0f9ff', iconColor: '#0284c7' },
  connected: { text: '#059669', iconBg: '#ecfdf5', iconColor: '#059669' },
  completed: { text: '#059669', iconBg: '#ecfdf5', iconColor: '#059669' },
  missed: { text: '#e11d48', iconBg: '#fff1f2', iconColor: '#e11d48' },
  declined: { text: '#e11d48', iconBg: '#fff1f2', iconColor: '#e11d48' },
  failed: { text: '#e11d48', iconBg: '#fff1f2', iconColor: '#e11d48' },
  ended: { text: '#334155', iconBg: '#f1f5f9', iconColor: '#475569' },
  requested: { text: '#334155', iconBg: '#f1f5f9', iconColor: '#475569' },
};

export function getCallHistoryToneStyles(tone: CallHistoryTone): { text: string; iconBg: string; iconColor: string } {
  return CALL_TONE_STYLES[tone] ?? CALL_TONE_STYLES.requested;
}

export type ConversationTimelineEntry =
  | { kind: 'message'; id: string; timestamp: number; message: MessageLike }
  | { kind: 'call'; id: string; timestamp: number; session: ConversationCallSession }
  | { kind: 'assignment'; id: string; timestamp: number; event: ConversationAssignmentEvent };

export type AssignmentEventPresentation = {
  actorLabel: string;
  actionLabel: string;
  targetLabel: string | null;
  body: string;
};

function getAssignmentMemberLabel(member: ConversationAssignmentMember | null, fallback = 'Someone') {
  if (!member) return fallback;
  if (member.userName?.trim()) return member.userName.trim();
  if (member.userEmail?.trim()) return member.userEmail.trim();
  return fallback;
}

function getAssignmentActorLabel(event: ConversationAssignmentEvent) {
  if (event.actedBy) return getAssignmentMemberLabel(event.actedBy);
  if (event.reason === 'DEFAULT_OWNER' || event.reason === 'ROUND_ROBIN') return 'System';
  return getAssignmentMemberLabel(event.actedBy);
}

export function getAssignmentEventPresentation(event: ConversationAssignmentEvent): AssignmentEventPresentation {
  const actorLabel = getAssignmentActorLabel(event);
  const fromLabel = event.fromMember ? getAssignmentMemberLabel(event.fromMember, 'someone') : null;
  const toLabel = event.toMember ? getAssignmentMemberLabel(event.toMember, 'someone') : null;

  if (event.reason === 'SELF') {
    if (event.toMember?.workspaceMemberId && event.actedBy?.workspaceMemberId === event.toMember.workspaceMemberId) {
      return {
        actorLabel,
        actionLabel: 'assigned',
        targetLabel: 'themselves',
        body: `${actorLabel} assigned this conversation to themselves`,
      };
    }
    return {
      actorLabel,
      actionLabel: 'assigned',
      targetLabel: toLabel,
      body: `${actorLabel} self-assigned this conversation`,
    };
  }

  if (event.reason === 'UNASSIGNED' || (!event.toMember && event.fromMember)) {
    return {
      actorLabel,
      actionLabel: 'unassigned this conversation',
      targetLabel: null,
      body: `${actorLabel} unassigned this conversation`,
    };
  }

  if (event.reason === 'REASSIGNED' || (event.fromMember && event.toMember)) {
    if (event.fromMember && event.toMember) {
      return {
        actorLabel,
        actionLabel: 'reassigned',
        targetLabel: toLabel,
        body: `${actorLabel} reassigned the conversation from ${fromLabel} to ${toLabel}`,
      };
    }
    if (event.toMember) {
      return {
        actorLabel,
        actionLabel: 'assigned',
        targetLabel: toLabel,
        body: `${actorLabel} assigned ${toLabel} to this conversation`,
      };
    }
  }

  if (event.toMember) {
    return {
      actorLabel,
      actionLabel: 'assigned',
      targetLabel: toLabel,
      body: `${actorLabel} assigned ${toLabel} to this conversation`,
    };
  }

  if (event.fromMember) {
    return {
      actorLabel,
      actionLabel: 'unassigned this conversation',
      targetLabel: null,
      body: `${actorLabel} unassigned this conversation`,
    };
  }

  return {
    actorLabel,
    actionLabel: 'updated the assignment',
    targetLabel: null,
    body: actorLabel === 'System'
      ? 'System updated the assignment for this conversation'
      : 'Someone updated the assignment for this conversation',
  };
}

export function getMessageListKey(message: MessageLike & { metadata?: any }): string {
  const clientKey = typeof message.metadata?.clientKey === 'string' ? message.metadata.clientKey : null;
  return clientKey || message.id;
}

export function buildConversationTimeline(
  messages: MessageLike[],
  callSessions: ConversationCallSession[],
  assignmentEvents: ConversationAssignmentEvent[] = [],
): ConversationTimelineEntry[] {
  const entries: ConversationTimelineEntry[] = [];
  for (const message of messages) {
    if (isInlineReactionMessage(message)) continue;
    const timestamp = new Date(message.sentAt ?? message.createdAt ?? '').getTime();
    entries.push({ kind: 'message', id: getMessageListKey(message), timestamp: Number.isNaN(timestamp) ? 0 : timestamp, message });
  }
  for (const session of callSessions) {
    if (session.status === 'PERMISSION_REQUESTED') continue;
    const timestamp = new Date(getCallSessionTimelineTimestamp(session)).getTime();
    entries.push({ kind: 'call', id: session.id, timestamp: Number.isNaN(timestamp) ? 0 : timestamp, session });
  }
  for (const event of assignmentEvents) {
    const timestamp = new Date(event.createdAt).getTime();
    entries.push({ kind: 'assignment', id: event.id, timestamp: Number.isNaN(timestamp) ? 0 : timestamp, event });
  }
  entries.sort((a, b) => (a.timestamp - b.timestamp) || a.id.localeCompare(b.id));
  return entries;
}
