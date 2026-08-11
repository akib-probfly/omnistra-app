import { io, type Socket } from 'socket.io-client';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.omnistra.ai/api/v1').replace(/\/$/, '');
const configuredSocketUrl = (process.env.EXPO_PUBLIC_SOCKET_URL ?? '').trim();
const SOCKET_URL = (configuredSocketUrl || new URL(API_BASE_URL).origin).replace(/\/$/, '');

export const REALTIME_NAMESPACE = '/realtime';
export type { Socket };

export function createRealtimeSocket(getAccessToken: () => string | null): Socket {
  return io(`${SOCKET_URL}${REALTIME_NAMESPACE}`, {
    // Prefer websocket on native; polling often hits CORS/origin issues in RN.
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    autoConnect: true,
    // Cookie credentials are for the web app; RN authenticates via JWT in `auth`.
    withCredentials: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
    forceNew: true,
  });
}

let connectionStatus: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
const statusListeners = new Set<() => void>();

let activeConversationId: string | null = null;

export function setActiveConversationId(conversationId: string | null) {
  activeConversationId = conversationId;
}

export function getActiveConversationId() {
  return activeConversationId;
}

function emitStatus(next: typeof connectionStatus) {
  if (connectionStatus === next) return;
  connectionStatus = next;
  statusListeners.forEach((listener) => listener());
}

export function setRealtimeConnectionStatus(next: typeof connectionStatus) {
  emitStatus(next);
}

export function getRealtimeConnectionStatus() {
  return connectionStatus;
}

export function subscribeRealtimeConnectionStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}
