import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function flow() {
  let resolveBrowser;
  let dismissed = 0;
  let opened;
  const linking = { createURL: () => 'osaas://channels/messenger/mobile-callback' };
  const browser = {
    openAuthSessionAsync: url => { opened = url; return new Promise(resolve => { resolveBrowser = resolve; }); },
    dismissAuthSession: () => { dismissed++; },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/messenger-business-connect.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name === 'expo-linking' ? linking : browser, URL, URLSearchParams, Date, setTimeout, clearTimeout });
  return { ...module.exports, emit: url => resolveBrowser({type: 'success', url}), cancelBrowser: () => resolveBrowser({type: 'cancel'}), get dismissed() { return dismissed; }, get opened() { return opened; } };
}
const launch = { state: 'expected-state', expiresAt: new Date(Date.now() + 60_000).toISOString(), launchUrl: 'https://www.facebook.com/v25.0/dialog/oauth?state=expected-state', redirectUri: 'https://app.example.com/channels/messenger/callback' };
const callback = 'osaas://channels/messenger/mobile-callback';

test('browser callback requires exact destination and matching state', () => {
  const f = flow();
  assert.equal(f.readMessengerBusinessCallback(`${callback}?state=expected-state&code=auth`, callback, launch.state), 'auth');
  for (const url of [`${callback}?state=wrong&code=auth`, 'osaas://other?state=expected-state&code=auth', 'https://channels/messenger/mobile-callback?state=expected-state&code=auth']) assert.equal(f.readMessengerBusinessCallback(url, callback, launch.state), null);
  assert.throws(() => f.readMessengerBusinessCallback(`${callback}?state=expected-state&error=cancelled`, callback, launch.state), /cancelled/);
});
test('successful in-app auth session validates its callback', async () => {
  const f = flow();
  const result = f.authorizeMessengerBusiness(launch, new AbortController().signal);
  assert.equal(new URL(f.opened).pathname, '/channels/messenger/mobile-connect');
  assert.equal(new URL(f.opened).search, '');
  f.emit(`${callback}?state=expected-state&code=auth`);
  assert.equal(await result, 'auth');
  assert.equal(f.dismissed, 0);
});
test('cancellation dismisses the in-app session and expiry rejects before opening it', async () => {
  const f = flow();
  const controller = new AbortController();
  const result = f.authorizeMessengerBusiness(launch, controller.signal);
  controller.abort();
  await assert.rejects(result, /cancelled/);
  assert.equal(f.dismissed, 1);
  await assert.rejects(f.authorizeMessengerBusiness({ ...launch, expiresAt: 'invalid' }, new AbortController().signal), /expired/);
});

test('closing the authentication window and mismatched callback state cannot connect', async () => {
  for (const invalidState of [false, true]) {
    const f = flow();
    const result = f.authorizeMessengerBusiness(launch, new AbortController().signal);
    if (invalidState) f.emit(`${callback}?state=wrong&code=auth`); else f.cancelBrowser();
    await assert.rejects(result, invalidState ? /unexpected setup/ : /cancelled/);
  }
});
