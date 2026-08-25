import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { bridgeMessageIdempotencyKey } from '../src/routes/webhooks.js';
import { getIncomingMessage } from '../src/bridge/webhook.js';
import { extractTypebotReplies } from '../src/bridge/replies.js';
import { createBridgeQueue } from '../src/bridge/queue.js';

const config = {
  AUTH_DISABLED: true,
  CORS_ORIGIN: 'https://dashboard.example.com',
  OIDC_ISSUER: 'https://auth.example.com/realms/unified',
  OIDC_JWKS_URL: 'https://auth.example.com/realms/unified/protocol/openid-connect/certs',
  OIDC_CLIENT_ID: 'unified-dashboard',
  BRIDGE_SERVICE_SECRET: 'test-bridge-service-secret-12345',
  WEBHOOK_SHARED_SECRET: 'test-webhook-secret-123456789',
  CHATWOOT_BASE_URL: 'http://chatwoot-mock',
  TYPEBOT_BASE_URL: 'http://typebot-mock',
  CHATWOOT_API_TOKEN: 'test-chatwoot-token',
};

test('extracts incoming message from webhook body', () => {
  const message = getIncomingMessage({
    event: 'message_created',
    message_type: 'incoming',
    content: 'Hello bot',
    account: { id: 1 },
    inbox: { id: 2 },
    conversation: { id: 3 },
    id: 100,
  });
  assert.equal(message.content, 'Hello bot');
  assert.equal(message.accountId, '1');
  assert.equal(message.inboxId, '2');
  assert.equal(message.conversationId, '3');
  assert.equal(message.messageId, '100');
});

test('bridge idempotency keys are scoped beyond the provider message id', () => {
  const first = bridgeMessageIdempotencyKey({
    accountId: '1', inboxId: '2', conversationId: '3', messageId: '100',
  });
  const otherAccount = bridgeMessageIdempotencyKey({
    accountId: '9', inboxId: '2', conversationId: '3', messageId: '100',
  });
  const otherConversation = bridgeMessageIdempotencyKey({
    accountId: '1', inboxId: '2', conversationId: '8', messageId: '100',
  });

  assert.notEqual(first, otherAccount);
  assert.notEqual(first, otherConversation);
  assert.equal(first, 'bridge:message:1:2:3:100');
});

test('extracts typebot replies from rich text payload', () => {
  const replies = extractTypebotReplies({
    messages: [
      { content: { richText: [{ text: 'Welcome to our store!' }] } },
      { content: { plainText: 'How can I help?' } },
    ],
  });
  assert.deepEqual(replies, ['Welcome to our store!', 'How can I help?']);
});

test('webhook endpoint rejects invalid webhook token', async (t) => {
  const db = { async query() { return { rows: [], rowCount: 0 }; } };
  const app = createApp({ config, db });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/chatwoot?token=wrong-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'message_created' }),
  });
  assert.equal(response.status, 401);
});

test('webhook endpoint successfully processes valid incoming message', async (t) => {
  let mockTypebotCalled = false;
  let mockChatwootCalled = false;

  // Mock server for Typebot and Chatwoot endpoints
  const mockServer = (await import('node:http')).createServer(async (req, res) => {
    if (req.url.includes('/startChat')) {
      mockTypebotCalled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sessionId: 'session-xyz',
        messages: [{ content: { richText: [{ text: 'Hello from mock bot' }] } }],
      }));
      return;
    }
    if (req.url.includes('/messages')) {
      mockChatwootCalled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 999, content: 'Hello from mock bot' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  mockServer.listen(0, '127.0.0.1');
  await new Promise((resolve) => mockServer.once('listening', resolve));
  t.after(() => new Promise((resolve) => mockServer.close(resolve)));

  const mockPort = mockServer.address().port;
  const testConfig = {
    ...config,
    TYPEBOT_BASE_URL: `http://127.0.0.1:${mockPort}`,
    CHATWOOT_BASE_URL: `http://127.0.0.1:${mockPort}`,
  };

  const db = {
    async query(sql, params) {
      if (sql.includes('FROM channel_connections cc')) {
        return {
          rowCount: 1,
          rows: [{
            channel_connection_id: 'conn-1',
            tenant_id: 'tenant-1',
            provider: 'instagram',
            credential_ref: 'default',
            chatwoot_account_id: params[0],
            chatwoot_inbox_id: params[1],
            automation_id: 'auto-1',
            engine: 'typebot',
            typebot_public_id: 'my-public-typebot-id',
            current_version: 1,
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const app = createApp({ config: testConfig, db });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/chatwoot?token=test-webhook-secret-123456789`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event: 'message_created',
      message_type: 'incoming',
      content: 'Hi order assistance',
      account: { id: 1 },
      inbox: { id: 2 },
      conversation: { id: 3 },
      id: 555,
    }),
  });

  assert.equal(response.status, 204);
  assert.equal(mockTypebotCalled, true);
  assert.equal(mockChatwootCalled, true);
});

test('bridge queue retries on error and moves to DLQ when maxRetries exceeded', async () => {
  let callCount = 0;
  const mockProcessMessage = async () => {
    callCount += 1;
    throw new Error('Transient connection error');
  };

  const lists = new Map();
  const mockRedis = {
    async rPush(key, value) {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).push(value);
    },
    async lPop(key) {
      if (!lists.has(key) || lists.get(key).length === 0) return null;
      return lists.get(key).shift();
    },
    async lMove(source, destination) {
      if (!lists.has(source) || lists.get(source).length === 0) return null;
      const value = lists.get(source).shift();
      if (!lists.has(destination)) lists.set(destination, []);
      lists.get(destination).push(value);
      return value;
    },
    async lRange(key) {
      return lists.get(key) || [];
    },
    async lRem(key, _count, value) {
      if (!lists.has(key)) return 0;
      const items = lists.get(key);
      const index = items.indexOf(value);
      if (index === -1) return 0;
      items.splice(index, 1);
      return 1;
    },
  };

  const queue = createBridgeQueue({
    redis: mockRedis,
    processMessage: mockProcessMessage,
    maxRetries: 3,
    initialBackoffMs: 10,
    autoStart: false,
  });

  const message = { messageId: 'm-1', accountId: '1', conversationId: '10' };
  await queue.enqueue(message);

  // Process attempt 1
  await queue.processNextRedisJob();
  assert.equal(callCount, 1);

  // Process attempt 2
  await queue.processNextRedisJob();
  assert.equal(callCount, 2);

  // Process attempt 3 (max retries reached -> moved to DLQ)
  await queue.processNextRedisJob();
  assert.equal(callCount, 3);

  const dlq = await queue.getDlq();
  assert.equal(dlq.length, 1);
  assert.equal(dlq[0].message.messageId, 'm-1');
  assert.equal(dlq[0].attempts, 3);
  assert.equal(dlq[0].error, 'Transient connection error');

  await queue.stop();
});
