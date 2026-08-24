import * as SecureStore from 'expo-secure-store';
import { setBillingLocked } from '../lib/billing-lock';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.zurvis.io/api/v1').replace(/\/$/, '');
export const apiUrl = (value: string | null): string | null => {
  if (!value) return null;
  const base = API_BASE_URL;
  try {
    const parsed = new URL(value, `${base}/`);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0') {
      const apiBase = new URL(base);
      return `${apiBase.origin}${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return `${base.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
  }
};
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isApiErrorWithStatus(error: unknown, status: number) {
  return error instanceof ApiError && error.status === status;
}

export let latestAccessToken: string | null = null;
let authExpiredHandler: (() => void) | null = null;
const accessTokenListeners = new Set<(token: string | null) => void>();

export function setLatestAccessToken(token: string | null) {
  if (latestAccessToken === token) return;
  latestAccessToken = token;
  accessTokenListeners.forEach((listener) => listener(token));
}

export function subscribeAccessToken(listener: (token: string | null) => void) {
  accessTokenListeners.add(listener);
  return () => {
    accessTokenListeners.delete(listener);
  };
}

export function setAuthExpiredHandler(handler: (() => void) | null) {
  authExpiredHandler = handler;
}

export async function uploadFile(path: string, uri: string, name: string, mimeType: string, fields: Record<string, string> = {}) {
  const token = await SecureStore.getItemAsync('access-token');
  setLatestAccessToken(token);
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  form.append('file', { uri, name, type: mimeType } as any);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!response.ok) throw new Error(`File upload failed (${response.status})`);
  const payload = await response.json() as any;
  return (payload?.data ?? payload) as {
    id: string;
    mimeType?: string;
    mediaType?: string;
    originalName?: string | null;
    sizeBytes?: number | null;
    downloadUrl?: string;
    previewUrl?: string | null;
    thumbnailUrl?: string | null;
  };
}

export async function apiFetch<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const { auth = true, ...fetchInit } = init;
  const token = auth ? await SecureStore.getItemAsync('access-token') : null;
  if (auth) setLatestAccessToken(token);
  if (__DEV__) console.log(`[api] request ${fetchInit.method ?? 'GET'} ${path}`, { authenticated: Boolean(token) });
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchInit,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchInit.headers,
    },
  });

  const requestHeaders = new Headers(fetchInit.headers);
  if (auth && response.status === 401 && requestHeaders.get('x-mobile-retry') !== '1') {
    const refreshToken = await SecureStore.getItemAsync('refresh-token');
    if (refreshToken) {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-transport': 'body' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshResponse.ok) {
        const refreshPayload = await refreshResponse.json() as { accessToken?: string; refreshToken?: string; data?: { accessToken?: string; refreshToken?: string } };
        const refreshed = refreshPayload.data ?? refreshPayload;
        if (refreshed.accessToken) {
          await SecureStore.setItemAsync('access-token', refreshed.accessToken);
          if (refreshed.refreshToken) await SecureStore.setItemAsync('refresh-token', refreshed.refreshToken);
          setLatestAccessToken(refreshed.accessToken);
          return apiFetch<T>(path, { ...init, headers: { ...Object.fromEntries(requestHeaders.entries()), 'x-mobile-retry': '1' } });
        }
      }
    }
  }

  if (!response.ok) {
    if (auth && response.status === 401 && requestHeaders.get('x-mobile-retry') !== '1') {
      authExpiredHandler?.();
    }
    const raw = await response.text();
    let message = `Request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(raw) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? message;
    } catch {
      if (raw && !raw.includes('\\n') && raw.length < 240) message = raw;
    }
    if (__DEV__) console.error(`[api] ${fetchInit.method ?? 'GET'} ${path} -> ${response.status}`, message);
    if (response.status === 402 && !path.startsWith('/billing') && !path.startsWith('/auth')) {
      setBillingLocked(message);
    }
    throw new ApiError(message, response.status);
  }
  const payload = await response.json() as T | { data?: T };
  if (typeof payload === 'object' && payload !== null && 'data' in payload && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}
