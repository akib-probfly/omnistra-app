import AsyncStorage from '@react-native-async-storage/async-storage';
import { callScopeFromAccessToken } from './jwt-workspace';
import { isIncomingCallPromptExpired } from './incoming-call-state';

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
  storedForUserId?: string;
};

type Listener = (prompt: IncomingCallPrompt | null) => void;

/**
 * Persisted so a call that rang while the app was killed can still be answered
 * after the cold start the notification triggers.
 */
const STORAGE_KEY = 'incoming-call-prompt';

let currentPrompt: IncomingCallPrompt | null = null;
const listeners = new Set<Listener>();
let revision = 0;
let storageWrites = Promise.resolve();
function enqueueStorage(operation: () => Promise<void>) {
  storageWrites = storageWrites.then(operation, operation).catch(() => {});
  return storageWrites;
}


export function readIncomingCallPrompt() {
  return currentPrompt;
}

export function writeIncomingCallPrompt(prompt: IncomingCallPrompt) {
  const scope = callScopeFromAccessToken();
  if (!scope || scope.workspaceId !== prompt.workspaceId || !scope.canManageCalls ||
      prompt.type !== 'INCOMING_CALL' || prompt.callEvent === 'ENDED' || isIncomingCallPromptExpired(prompt)) return;
  prompt = { ...prompt, storedForUserId: scope.userId };
  revision++;
  currentPrompt = prompt;
  listeners.forEach((listener) => listener(prompt));
  return enqueueStorage(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prompt)));
}

export function clearIncomingCallPrompt(callSessionId?: string | null) {
  if (callSessionId && currentPrompt && currentPrompt.entityId !== callSessionId) return;
  revision++;
  currentPrompt = null;
  listeners.forEach((listener) => listener(null));
  return enqueueStorage(async () => {
    if (callSessionId) {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try { if ((JSON.parse(raw) as IncomingCallPrompt).entityId !== callSessionId) return; }
      catch { /* Invalid storage is safe to discard. */ }
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
  });
}

/** Restore a ringing call written by the background push task before this process started. */
export async function hydrateIncomingCallPrompt(): Promise<IncomingCallPrompt | null> {
  const initialRevision = revision;
  try {
    await storageWrites;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IncomingCallPrompt;
    if (!parsed || parsed.type !== 'INCOMING_CALL' || typeof parsed.entityId !== 'string' || isIncomingCallPromptExpired(parsed)) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (currentPrompt || revision !== initialRevision) return currentPrompt;
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
