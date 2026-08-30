import AsyncStorage from '@react-native-async-storage/async-storage';

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
  callEvent?: 'RINGING' | 'ENDED';
};

type Listener = (prompt: IncomingCallPrompt | null) => void;

/**
 * Persisted so a call that rang while the app was killed can still be answered
 * after the cold start the notification triggers.
 */
const STORAGE_KEY = 'incoming-call-prompt';

let currentPrompt: IncomingCallPrompt | null = null;
const listeners = new Set<Listener>();

export function readIncomingCallPrompt() {
  return currentPrompt;
}

export async function writeIncomingCallPrompt(prompt: IncomingCallPrompt) {
  if (prompt.type !== 'INCOMING_CALL') return;
  currentPrompt = prompt;
  listeners.forEach((listener) => listener(prompt));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prompt)).catch(
    () => {},
  );
}

export function clearIncomingCallPrompt(callSessionId?: string | null) {
  if (callSessionId && currentPrompt?.entityId !== callSessionId) return;
  currentPrompt = null;
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  listeners.forEach((listener) => listener(null));
}

/** Restore a ringing call written by the background push task before this process started. */
export async function hydrateIncomingCallPrompt(): Promise<IncomingCallPrompt | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IncomingCallPrompt;
    if (
      !parsed ||
      parsed.type !== 'INCOMING_CALL' ||
      typeof parsed.entityId !== 'string'
    ) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (currentPrompt) return currentPrompt;
    currentPrompt = parsed;
    listeners.forEach((listener) => listener(parsed));
    return parsed;
  } catch {
    return null;
  }
}

export function subscribeIncomingCallPrompt(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
