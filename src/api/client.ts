import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.omnistra.ai/api/v1').replace(/\/$/, '');
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
export let latestAccessToken: string | null = null;
let authExpiredHandler: (() => void) | null = null;

export function setAuthExpiredHandler(handler: (() => void) | null) {
  authExpiredHandler = handler;
}

export async function uploadFile(path: string, uri: string, name: string, mimeType: string, fields: Record<string, string> = {}) {
  const token = await SecureStore.getItemAsync('access-token');
  latestAccessToken = token;
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
  return (payload?.data ?? payload) as { id: string; mimeType?: string; mediaType?: string };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await SecureStore.getItemAsync('access-token');
  latestAccessToken = token;
  console.log(`[api] request ${init.method ?? 'GET'} ${path}`, { authenticated: Boolean(token) });
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const requestHeaders = new Headers(init.headers);
  if (response.status === 401 && requestHeaders.get('x-mobile-retry') !== '1') {
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
          return apiFetch<T>(path, { ...init, headers: { ...Object.fromEntries(requestHeaders.entries()), 'x-mobile-retry': '1' } });
        }
      }
    }
  }

  if (!response.ok) {
    if (response.status === 401 && requestHeaders.get('x-mobile-retry') !== '1') {
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
    console.error(`[api] ${init.method ?? 'GET'} ${path} -> ${response.status}`, message);
    throw new Error(message);
  }
  const payload = await response.json() as T | { data?: T };
  if (typeof payload === 'object' && payload !== null && 'data' in payload && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}
