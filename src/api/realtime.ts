import { io, type Socket } from 'socket.io-client';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://osaas-mvp-api.probfly.com/api/v1').replace(/\/$/, '');
const SOCKET_URL = (process.env.EXPO_PUBLIC_SOCKET_URL ?? new URL(API_BASE_URL).origin).replace(/\/$/, '');

export const REALTIME_NAMESPACE = '/realtime';
export type { Socket };

export function createRealtimeSocket(getAccessToken: () => string | null): Socket {
  return io(`${SOCKET_URL}${REALTIME_NAMESPACE}`, {
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    autoConnect: true,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
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
