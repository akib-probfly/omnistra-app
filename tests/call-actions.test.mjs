import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { application } from './helpers/application.mjs';

class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const params = { conversationId: 'conversation-1', callSessionId: 'call-1' };
const ringing = { id: 'call-1', workspaceId: 'workspace-1', conversationId: 'conversation-1', direction: 'INBOUND', status: 'RINGING' };
let current;
let readError;
let cleared;
let dismissed;
let sent;
const load = application({
  'src/api/client': { ApiError },
  'src/api/inbox': { fetchConversationCallSession: async () => { if (readError) throw readError; return current; }, declineConversationCall: async () => { sent++; return { ...ringing, status: 'REJECTED' }; } },
  'src/api/notifications': { notificationQueryKeys: { all: ['notifications'] } },
  'src/lib/incoming-call-prompt': { clearIncomingCallPrompt: async (id) => { cleared = id; } },
  'src/lib/call-notification': { dismissIncomingCallNotification: async (id) => { dismissed = id; } },
  'src/lib/inbox-utils': { isCallSessionTerminal: (status) => ['MISSED', 'ENDED'].includes(status) },
  'src/lib/active-call-cache': { upsertActiveCallSessionCache: () => {} },
  'src/lib/jwt-workspace': { callScopeFromAccessToken: () => ({ userId: 'user-1', workspaceId: 'workspace-1', canManageCalls: true }) },
});
const actions = load('src/lib/call-session-reconciliation');

test('mobile preflight prevents answer/reject after termination or claim', async () => {
  readError = null;
  for (const changed of [{ status: 'MISSED' }, { claimedByWorkspaceMemberId: 'other-member' }]) {
    current = { ...ringing, ...changed };
    for (const action of ['answer', 'decline']) {
      let performed = false;
      await assert.rejects(actions.performVerifiedCallAction(params, action, async () => { performed = true; }), (error) => error.status === 409);
      assert.equal(performed, false);
    }
  }
});

test('notification decline is scoped and expired taps never invoke a call action', async () => {
  readError = null; current = ringing; sent = 0;
  const prompt = { type: 'INCOMING_CALL', workspaceId: 'workspace-1', entityId: 'call-1', conversationId: 'conversation-1', createdAt: new Date().toISOString() };
  for (const changed of [{ workspaceId: 'other-workspace' }, { callEvent: 'ENDED' }, { createdAt: new Date(Date.now() - 120_000).toISOString() }]) {
    await actions.declineCallFromNotification({ ...prompt, ...changed });
    assert.equal(sent, 0);
  }
  await actions.declineCallFromNotification(prompt);
  assert.equal(sent, 1);
  assert.equal(cleared, 'call-1'); assert.equal(dismissed, 'call-1');
});

test('foreground and headless errors clear unavailable calls but preserve busy live calls', async () => {
  for (const headless of [true, false]) {
    const client = headless ? undefined : new QueryClient();
    current = ringing; readError = null; cleared = null; dismissed = null;
    client?.setQueryData(['active-calls', 'workspace-1', 'user-1'], { items: [ringing] });
    await actions.reconcileCallActionError(client, new ApiError('busy', 409), params);
    assert.equal(cleared, null);
    for (const status of [403, 404, 409]) {
      current = { ...ringing, status: 'ENDED' }; cleared = null;
      await actions.reconcileCallActionError(client, new ApiError('changed', status), params);
      assert.equal(cleared, 'call-1'); assert.equal(dismissed, 'call-1');
    }
    if (client) assert.equal(client.getQueryData(['active-calls', 'workspace-1', 'user-1']).items.length, 0);
    client?.clear();
  }
});

test('network failure does not establish that the call is unavailable', async () => {
  readError = new Error('timeout'); cleared = null;
  await actions.reconcileCallActionError(undefined, new ApiError('busy', 409), params);
  assert.equal(cleared, null);
  readError = null;
});
