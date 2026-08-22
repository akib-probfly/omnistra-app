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

type Listener = () => void;

let chrome: CallChromeSnapshot | null = null;
let focusedConversationId: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setCallChrome(next: CallChromeSnapshot | null) {
  chrome = next;
  emit();
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

export function subscribeCallChrome(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isCallChromeForFocusedConversation() {
  return Boolean(chrome && focusedConversationId && chrome.conversationId === focusedConversationId);
}
