import { clearIncomingCallPrompt } from '../lib/incoming-call-prompt';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, setAuthExpiredHandler, setLatestAccessToken } from '../api/client';
import { clearBillingLock } from '../lib/billing-lock';
import { revokeRegisteredMobilePushDevice } from '../lib/mobilePushRegistration';

type Session = {
  accessToken: string;
  refreshToken?: string;
  user: { name: string | null; email: string; avatarUrl?: string | null; role?: string };
};
type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  updateUser: (update: Partial<Session['user']>) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      if (!active) return;
      setLoading(false);
    }, 4000);

    (async () => {
      try {
        const [value, accessToken] = await Promise.all([SecureStore.getItemAsync('session'), SecureStore.getItemAsync('access-token')]);
        if (!active) return;
        if (!value || !accessToken) {
          setSession(null);
          return;
        }
        const parsed = JSON.parse(value) as { user?: Session['user'] };
        if (!parsed.user) throw new Error('Invalid stored session');
        queryClient.clear();
        setSession({ user: parsed.user, accessToken });
        setLatestAccessToken(accessToken);
      } catch (error) {
        console.warn('[auth] session restore failed', error);
        await Promise.all([SecureStore.deleteItemAsync('session'), SecureStore.deleteItemAsync('access-token'), SecureStore.deleteItemAsync('refresh-token')]);
        if (active) setSession(null);
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [queryClient]);
  useEffect(() => {
    const clearExpiredSession = () => {
      clearBillingLock();
      void clearIncomingCallPrompt();
      setSession(null);
      setLatestAccessToken(null);
      queryClient.clear();
      void Promise.all([SecureStore.deleteItemAsync('session'), SecureStore.deleteItemAsync('access-token'), SecureStore.deleteItemAsync('refresh-token')]);
    };
    setAuthExpiredHandler(clearExpiredSession);
    return () => setAuthExpiredHandler(null);
  }, [queryClient]);
  async function save(next: Session) {
    // Login establishes a new account boundary. clear() destroys pending query
    // retries and removes both query and mutation caches before screens mount.
    queryClient.clear();
    setSession(next);
    setLatestAccessToken(next.accessToken);
    await SecureStore.setItemAsync('session', JSON.stringify({ user: next.user }));
    await SecureStore.setItemAsync('access-token', next.accessToken);
    if (next.refreshToken) await SecureStore.setItemAsync('refresh-token', next.refreshToken);
  }
  async function updateUser(update: Partial<Session['user']>) {
    const current = session;
    if (!current) return;
    const next = { ...current, user: { ...current.user, ...update } };
    setSession(next);
    await SecureStore.setItemAsync('session', JSON.stringify({ user: next.user }));
  }
  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        login: async (email, password) =>
          save(
            await apiFetch<Session>('/auth/login', {
              method: 'POST',
              auth: false,
              headers: { 'x-auth-transport': 'body' },
              body: JSON.stringify({
                email: email.trim().toLowerCase(),
                password,
              }),
            }),
          ),
        updateUser,
        logout: async () => {
          try {
            const refreshToken = await SecureStore.getItemAsync('refresh-token');
            if (refreshToken) {
              await apiFetch('/auth/logout', {
                method: 'POST',
                headers: { 'x-auth-transport': 'body' },
                body: JSON.stringify({ refreshToken }),
              });
            }
          } catch (error) {
            console.warn('[auth] server logout failed', error);
          } finally {
            try {
              await revokeRegisteredMobilePushDevice();
            } catch (error) {
              console.warn('[auth] push cleanup failed', error);
            } finally {
              setSession(null);
              setLatestAccessToken(null);
              queryClient.clear();
              clearBillingLock();
              // Attempt every local cleanup even if one storage operation fails.
              const results = await Promise.allSettled([
                clearIncomingCallPrompt(),
                SecureStore.deleteItemAsync('session'),
                SecureStore.deleteItemAsync('access-token'),
                SecureStore.deleteItemAsync('refresh-token'),
              ]);
              for (const result of results) {
                if (result.status === 'rejected') console.warn('[auth] local logout cleanup failed', result.reason);
              }
            }
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
