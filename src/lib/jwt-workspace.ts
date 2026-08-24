import { latestAccessToken } from '../api/client';

export function workspaceIdFromAccessToken(token: string | null | undefined = latestAccessToken): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(globalThis.atob(padded)) as { workspaceId?: unknown };
    return typeof json.workspaceId === 'string' && json.workspaceId ? json.workspaceId : null;
  } catch {
    return null;
  }
}
