export type IncomingCallPrompt = {
  notificationId: string;
  workspaceId: string;
  type: 'INCOMING_CALL';
  entityType: string;
  entityId: string;
  conversationId: string | null;
  channelId: string | null;
  targetScope: string;
  title: string;
  body: string;
  createdAt: string;
  metadata: unknown;
  recipientUserIds: string[] | null;
};

type Listener = (prompt: IncomingCallPrompt | null) => void;

let currentPrompt: IncomingCallPrompt | null = null;
const listeners = new Set<Listener>();

export function readIncomingCallPrompt() {
  return currentPrompt;
}

export function writeIncomingCallPrompt(prompt: IncomingCallPrompt) {
  if (prompt.type !== 'INCOMING_CALL') return;
  currentPrompt = prompt;
  listeners.forEach((listener) => listener(prompt));
}

export function clearIncomingCallPrompt(callSessionId?: string | null) {
  if (callSessionId && currentPrompt?.entityId !== callSessionId) return;
  currentPrompt = null;
  listeners.forEach((listener) => listener(null));
}

export function subscribeIncomingCallPrompt(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
