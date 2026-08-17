import test from 'node:test';
import assert from 'node:assert/strict';
import { getIncomingMessage } from '../src/webhook.js';

test('extracts account, inbox and conversation routing from Chatwoot webhooks', () => {
  assert.deepEqual(getIncomingMessage({
    event: 'message_created', message_type: 'incoming', content: 'مرحبا', id: 81,
    account: { id: 2 }, inbox: { id: 9 }, conversation: { id: 44 },
  }), {
    content: 'مرحبا', accountId: '2', inboxId: '9', conversationId: '44', messageId: '81',
  });
});

test('ignores webhooks without an inbox route', () => {
  assert.equal(getIncomingMessage({
    event: 'message_created', message_type: 'incoming', content: 'مرحبا', id: 81,
    account: { id: 2 }, conversation: { id: 44 },
  }), null);
});
