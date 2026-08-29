import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, setAuthExpiredHandler, setLatestAccessToken } from '../api/client';
import { clearBillingLock } from '../lib/billing-lock';
import { revokeRegisteredMobilePushDevice } from '../lib/mobilePushRegistration';

type Session = {
  accessToken: string;
  refreshToken?: string;
  user: { name: string | null; email: string; avatarUrl?: string | null };
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
  }, []);
  useEffect(() => {
    const clearExpiredSession = () => {
      clearBillingLock();
      setSession(null);
      setLatestAccessToken(null);
      void Promise.all([SecureStore.deleteItemAsync('session'), SecureStore.deleteItemAsync('access-token'), SecureStore.deleteItemAsync('refresh-token')]);
    };
    setAuthExpiredHandler(clearExpiredSession);
    return () => setAuthExpiredHandler(null);
  }, []);
  async function save(next: Session) {
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
              headers: { 'x-auth-transport': 'body' },
              body: JSON.stringify({
                email: email.trim().toLowerCase(),
                password,
              }),
            }),
          ),
        updateUser,
        logout: async () => {
          const refreshToken = await SecureStore.getItemAsync('refresh-token');
          if (refreshToken)
            await apiFetch('/auth/logout', {
              method: 'POST',
              headers: { 'x-auth-transport': 'body' },
              body: JSON.stringify({ refreshToken }),
            });
          await revokeRegisteredMobilePushDevice();
          clearBillingLock();
          setSession(null);
          setLatestAccessToken(null);
          await SecureStore.deleteItemAsync('session');
          await SecureStore.deleteItemAsync('access-token');
          await SecureStore.deleteItemAsync('refresh-token');
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
