import assert from 'node:assert/strict';
import test from 'node:test';
import { application } from './helpers/application.mjs';

const scope = { userId: 'user-1', workspaceId: 'workspace-1', canManageCalls: true };
const prompt = { type: 'INCOMING_CALL', entityId: 'call-1', conversationId: 'conversation-1',
  workspaceId: 'workspace-1', storedForUserId: 'user-1', createdAt: new Date().toISOString() };
const call = { id: 'call-1', workspaceId: 'workspace-1', conversationId: 'conversation-1',
  direction: 'INBOUND', status: 'RINGING', endedAt: null, claimedByUserId: null,
  claimedByWorkspaceMemberId: null, metadata: { routingTargetUserIds: ['user-1'] } };

test('expired, malformed and cross-account prompts cannot become actionable', () => {
  const state = application()('src/lib/incoming-call-state');
  assert.equal(state.isIncomingCallPromptInScope(prompt, scope), true);
  for (const changed of [{ workspaceId: 'other' }, { storedForUserId: 'other' }, { createdAt: 'invalid' },
    { createdAt: new Date(Date.now() - 90_001).toISOString() }, { callEvent: 'ENDED' }]) {
    assert.equal(state.isIncomingCallPromptInScope({ ...prompt, ...changed }, scope), false);
  }
  assert.equal(state.isActionableIncomingCall(call), true);
  assert.equal(state.isActionableIncomingCall({ ...call, claimedByWorkspaceMemberId: 'member-other' }), false);
  assert.equal(state.isActionableIncomingCall({ ...call, status: 'MISSED' }), false);
  assert.equal(state.isCallSessionRoutedToUser({ ...call, metadata: { routingTargetUserIds: [] } }, 'user-1'), false);
});

function promptStore(initial = null) {
  let stored = initial ? JSON.stringify(initial) : null;
  const load = application({
    '@react-native-async-storage/async-storage': { getItem: async () => stored, setItem: async (_key, value) => { stored = value; }, removeItem: async () => { stored = null; } },
    'src/lib/jwt-workspace': { callScopeFromAccessToken: () => scope },
  });
  return { module: load('src/lib/incoming-call-prompt'), get stored() { return stored ? JSON.parse(stored) : null; } };
}

test('a headless ENDED signal clears matching persisted state before hydration', async () => {
  const store = promptStore(prompt);
  await store.module.clearIncomingCallPrompt('call-1');
  assert.equal(store.stored, null);
  assert.equal(await store.module.hydrateIncomingCallPrompt(), null);
});

test('late dismissal cannot erase a newer incoming call', async () => {
  const store = promptStore();
  await store.module.writeIncomingCallPrompt(prompt);
  const saving = store.module.writeIncomingCallPrompt({ ...prompt, entityId: 'call-2' });
  await store.module.clearIncomingCallPrompt('call-1');
  await saving;
  assert.equal(store.stored.entityId, 'call-2');
});

test('hydration cannot resurrect a prompt cleared concurrently', async () => {
  const store = promptStore(prompt);
  const restoring = store.module.hydrateIncomingCallPrompt();
  await store.module.clearIncomingCallPrompt('call-1');
  await restoring;
  assert.equal(store.module.readIncomingCallPrompt(), null);
  assert.equal(store.stored, null);
});

test('call UI scope and feed cache keys come from the current token', () => {
  const token = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.x`;
  const client = { latestAccessToken: token({ sub: 'user-1', workspaceId: 'workspace-1', permissions: ['conversation.read', 'message.send'] }) };
  const helpers = application({ 'src/api/client': client })('src/lib/jwt-workspace');
  assert.equal(helpers.callScopeFromAccessToken().canManageCalls, true);
  assert.equal(helpers.activeCallQueryKey().join(':'), 'active-calls:workspace-1:user-1');
  client.latestAccessToken = token({ sub: 'other-user', workspaceId: 'other-workspace', permissions: ['conversation.read'] });
  assert.equal(helpers.callScopeFromAccessToken().canManageCalls, false);
  assert.equal(helpers.activeCallQueryKey().join(':'), 'active-calls:other-workspace:other-user');
});

test('the app waits for an authoritative call and suppresses ended calls on cold start', () => {
  let resolved;
  const react = { useMemo: (fn) => fn(), useRef: (value) => ({ current: value }), useEffect: () => {},
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}], useSyncExternalStore: (_sub, snapshot) => snapshot() };
  class ApiError extends Error {}
  const queryClient = { getQueryData: () => null, getQueriesData: () => [] };
  const load = application({ react, 'react-native': { AppState: { currentState: 'active' } },
    '@tanstack/react-query': { useQueryClient: () => queryClient, useQuery: ({ queryKey }) => ({ data: queryKey[0] === 'active-calls' ? { items: [] } : queryKey[0] === 'call-session-state' ? resolved : { id: 'user-1' } }) },
    'src/auth/AuthContext': { useAuth: () => ({ session: {} }) },
    'src/api/client': { latestAccessToken: 'token', ApiError },
    'src/api/inbox': {}, 'src/api/profile': {},
    'src/lib/jwt-workspace': { callScopeFromAccessToken: () => scope, activeCallQueryKey: () => ['active-calls'] },
    'src/lib/incoming-call-prompt': { readIncomingCallPrompt: () => prompt },
    'src/lib/call-notification': {}, 'src/lib/whatsapp-calling': { extractWhatsappCallSignal: () => null },
    'src/lib/inbox-utils': { isCallSessionTerminal: () => false, isLiveCallSession: () => true },
    'src/hooks/useNotificationPreferences': { useNotificationPreferences: () => ({ isLoaded: true, incomingCallAlertsEnabled: true }) },
    'src/providers/CallControllerProvider': { useCallController: () => ({ connectionState: 'idle' }) },
    'src/api/realtime': { getRealtimeConnectionStatus: () => 'connected' },
    'src/lib/call-chrome': { getCallUiRevision: () => 0, getCallPartyHint: () => null, isGenericCallLabel: () => false },
    'src/lib/billing-lock': { pollingWhileUnlocked: (fn) => fn },
    'src/components/CallPanel': { CallPanel: () => null },
  });
  const { GlobalCallLayer } = load('src/components/GlobalCallLayer');
  assert.equal(GlobalCallLayer(), null);
  resolved = { ...call, status: 'MISSED', endedAt: new Date().toISOString() };
  assert.equal(GlobalCallLayer(), null);
  resolved = call;
  assert.equal(GlobalCallLayer().props.activeCallSession.id, 'call-1');
});
