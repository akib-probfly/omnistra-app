import { latestAccessToken } from '../api/client';

export function callScopeFromAccessToken(token: string | null | undefined = latestAccessToken) {
  if (!token) return null;
  try {
    const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!payload) return null;
    const claims = JSON.parse(globalThis.atob(payload)) as { sub?: unknown; workspaceId?: unknown; permissions?: unknown };
    if (typeof claims.sub !== 'string' || typeof claims.workspaceId !== 'string' || !claims.sub || !claims.workspaceId) return null;
    return { userId: claims.sub, workspaceId: claims.workspaceId,
      canManageCalls: Array.isArray(claims.permissions) && claims.permissions.includes('conversation.read') && claims.permissions.includes('message.send') };
  } catch { return null; }
}

export function activeCallQueryKey() {
  const scope = callScopeFromAccessToken();
  return ['active-calls', scope?.workspaceId ?? null, scope?.userId ?? null] as const;
}

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
