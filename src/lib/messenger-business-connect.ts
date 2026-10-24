import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

export function readMessengerBusinessCallback(url: string, returnUrl: string, state: string) {
  const callback = new URL(url);
  const expected = new URL(returnUrl);
  if (callback.protocol !== expected.protocol || callback.host !== expected.host || callback.pathname !== expected.pathname || callback.searchParams.get('state') !== state) return null;
  if (callback.searchParams.has('error')) throw new Error('Facebook sign-in was cancelled. You can try again.');
  const code = callback.searchParams.get('code');
  if (!code) throw new Error('Facebook did not return an authorization code. Start again.');
  return code;
}

export function authorizeMessengerBusiness(launch: { state: string; expiresAt: string; launchUrl: string; redirectUri: string }, signal: AbortSignal): Promise<string> {
  const returnUrl = Linking.createURL('channels/messenger/mobile-callback');
  const bridge = new URL('/channels/messenger/mobile-connect', launch.redirectUri);
  if (bridge.protocol !== 'https:') return Promise.reject(new Error('Messenger sign-in requires an HTTPS frontend.'));
  bridge.hash = new URLSearchParams({ launchUrl: launch.launchUrl, state: launch.state, returnUrl }).toString();
  const remaining = Date.parse(launch.expiresAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return Promise.reject(new Error('Messenger setup expired. Start again.'));
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error: Error | null, code?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) {
        try { WebBrowser.dismissAuthSession(); } catch { /* Session may already be closed. */ }
      }
      signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(code!);
    };
    const cancel = () => finish(new Error('Facebook sign-in was cancelled.'));
    const timer = setTimeout(() => finish(new Error('Messenger setup expired. Start again.')), Math.min(remaining, 10 * 60_000));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    void WebBrowser.openAuthSessionAsync(bridge.toString(), returnUrl, { createTask: false })
      .then(result => {
        if (result.type !== 'success') { cancel(); return; }
        try {
          const code = readMessengerBusinessCallback(result.url, returnUrl, launch.state);
          if (!code) throw new Error('Facebook returned an unexpected setup session. Start again.');
          finish(null, code);
        } catch (error) { finish(error instanceof Error ? error : new Error('Invalid Facebook callback.')); }
      })
      .catch(() => finish(new Error('Could not open the Facebook authentication window.')));
  });
}
