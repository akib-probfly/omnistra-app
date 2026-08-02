import { io, type Socket } from 'socket.io-client';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://osaas-mvp-api.probfly.com/api/v1').replace(/\/$/, '');
const SOCKET_URL = (process.env.EXPO_PUBLIC_SOCKET_URL ?? new URL(API_BASE_URL).origin).replace(/\/$/, '');

export const REALTIME_NAMESPACE = '/realtime';

export function createRealtimeSocket(accessToken: string): Socket {
  return io(`${SOCKET_URL}${REALTIME_NAMESPACE}`, {
    transports: ['websocket', 'polling'],
    auth: { token: accessToken },
    autoConnect: true,
  });
}
