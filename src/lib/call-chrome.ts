export type CallChromeSnapshot = {
  conversationId: string;
  label: string;
  avatarUrl: string | null;
  phase: 'incoming' | 'ongoing';
  isConnected: boolean;
  durationLabel: string;
  statusLabel: string;
  isMuted: boolean;
  isBusy: boolean;
  canAnswer: boolean;
  canToggleMute: boolean;
  onExpand: () => void;
  onToggleMute: () => void;
  onEndCall: () => void;
  onAnswerCall: () => void;
  onDeclineCall: () => void;
};

export type CallPartyHint = {
  label: string;
  avatarUrl: string | null;
};

type Listener = () => void;

let chrome: CallChromeSnapshot | null = null;
let focusedConversationId: string | null = null;
let revision = 0;
const partyHints = new Map<string, CallPartyHint>();
const listeners = new Set<Listener>();

const GENERIC_CALL_LABELS = new Set([
  'whatsapp',
  'whatsapp call',
  'messenger',
  'instagram',
  'tiktok',
  'facebook',
]);

export function isGenericCallLabel(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? '';
  return !normalized || GENERIC_CALL_LABELS.has(normalized);
}

function emit() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function getCallUiRevision() {
  return revision;
}

function chromeSignature(snapshot: CallChromeSnapshot | null) {
  if (!snapshot) return '';
  return [
    snapshot.conversationId,
    snapshot.label,
    snapshot.avatarUrl ?? '',
    snapshot.phase,
    snapshot.isConnected ? '1' : '0',
    snapshot.durationLabel,
    snapshot.statusLabel,
    snapshot.isMuted ? '1' : '0',
    snapshot.isBusy ? '1' : '0',
    snapshot.canAnswer ? '1' : '0',
    snapshot.canToggleMute ? '1' : '0',
  ].join('|');
}

export function setCallChrome(next: CallChromeSnapshot | null) {
  const changed = chromeSignature(chrome) !== chromeSignature(next);
  chrome = next;
  if (changed) emit();
}

export function getCallChrome() {
  return chrome;
}

export function setFocusedCallConversationId(conversationId: string | null) {
  if (focusedConversationId === conversationId) return;
  focusedConversationId = conversationId;
  emit();
}

export function getFocusedCallConversationId() {
  return focusedConversationId;
}

export function rememberCallParty(conversationId: string, label: string, avatarUrl?: string | null) {
  const trimmed = label.trim();
  if (!conversationId || isGenericCallLabel(trimmed)) return;
  const current = partyHints.get(conversationId);
  if (current?.label === trimmed && current.avatarUrl === (avatarUrl ?? null)) return;
  partyHints.set(conversationId, { label: trimmed, avatarUrl: avatarUrl ?? null });
  emit();
}

export function getCallPartyHint(conversationId: string | null | undefined) {
  if (!conversationId) return null;
  return partyHints.get(conversationId) ?? null;
}

export function subscribeCallChrome(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isCallChromeForFocusedConversation() {
  return Boolean(chrome && focusedConversationId && chrome.conversationId === focusedConversationId);
}
