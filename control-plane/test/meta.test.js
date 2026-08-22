import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetaPayload } from '../src/meta/normalize.js';
import { signMetaPayload, verifyMetaSignature } from '../src/meta/security.js';
import { deliverOutboundMessage } from '../src/outbox/outbox.js';
import { createApp } from '../src/app.js';
import { updateWebhookSubscription } from '../src/meta/oauth.js';

test('Meta HMAC verification accepts the exact raw body and rejects tampering', () => {
  const secret = 'test-meta-app-secret-123456789';
  const raw = Buffer.from('{"object":"page","entry":[]}');
  const signature = signMetaPayload(raw, secret);
  assert.equal(verifyMetaSignature(raw, signature, secret), true);
  assert.equal(verifyMetaSignature(Buffer.from(`${raw} `), signature, secret), false);
  assert.equal(verifyMetaSignature(raw, 'sha256=bad', secret), false);
});

test('Meta payload normalization extracts tenant routing and delivery receipts', () => {
  const events = normalizeMetaPayload({
    object: 'page',
    entry: [{
      id: 'page-42',
      messaging: [
        { sender: { id: 'customer-7' }, recipient: { id: 'page-42' }, timestamp: 10,
          message: { mid: 'mid-in-1', text: 'مرحبا' } },
        { delivery: { mids: ['mid-out-1'], watermark: 11 } },
      ],
    }],
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].provider, 'messenger');
  assert.equal(events[0].eventId, 'mid-in-1');
  assert.equal(events[0].externalAccountId, 'page-42');
  assert.equal(events[0].senderId, 'customer-7');
  assert.equal(events[0].text, 'مرحبا');
  assert.equal(events[0].eventType, 'message');
  assert.equal(events[1].providerMessageId, 'mid-out-1');
  assert.equal(events[1].eventType, 'delivered');
});

test('WhatsApp Cloud webhook normalization uses the phone-number ID for tenant routing', () => {
  const events = normalizeMetaPayload({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: 'phone-42' },
      contacts: [{ wa_id: '963900000000', profile: { name: 'Ahmad' } }],
      messages: [{ id: 'wamid.1', from: '963900000000', timestamp: '10', type: 'text', text: { body: 'السعر؟' } }],
    } }] }],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].provider, 'whatsapp');
  assert.equal(events[0].externalAccountId, 'phone-42');
  assert.equal(events[0].senderName, 'Ahmad');
  assert.equal(events[0].text, 'السعر؟');
});

test('real Meta delivery requires a server-side credential reference', async () => {
  await assert.rejects(() => deliverOutboundMessage({
    config: { META_GRAPH_VERSION: 'v25.0', META_CREDENTIALS_JSON: '{}' },
    channel: { provider: 'messenger', external_account_id: 'page-1', credential_ref: 'tenant-secret-1', config: {} },
    message: { id: 'out-1', provider_recipient_id: 'customer-1', content: { text: 'hello' } },
  }), { code: 'meta_credential_missing' });
});

test('Meta onboarding subscribes a Messenger Page to the required webhook fields', async () => {
  let request;
  const result = await updateWebhookSubscription({
    config: { META_GRAPH_VERSION: 'v25.0' },
    provider: 'messenger',
    accountId: 'page-42',
    accessToken: 'page-token',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });
  const url = new URL(request.url);
  assert.equal(`${url.origin}${url.pathname}`, 'https://graph.facebook.com/v25.0/page-42/subscribed_apps');
  assert.equal(url.searchParams.get('subscribed_fields'), 'messages,messaging_postbacks,message_deliveries,message_reads');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'Bearer page-token');
  assert.equal(result.success, true);
});

test('Instagram Login webhook subscriptions use the Instagram Graph endpoint', async () => {
  let requestUrl;
  await updateWebhookSubscription({
    config: { META_GRAPH_VERSION: 'v25.0' },
    provider: 'instagram',
    accountId: 'ig-42',
    accessToken: 'ig-token',
    graphMode: 'instagram_login',
    fetchImpl: async (url) => {
      requestUrl = String(url);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });
  const url = new URL(requestUrl);
  assert.equal(`${url.origin}${url.pathname}`, 'https://graph.instagram.com/v25.0/ig-42/subscribed_apps');
  assert.equal(url.searchParams.get('subscribed_fields'), 'messages,messaging_postbacks,messaging_seen');
});

test('Meta disconnect removes only this app webhook subscription from the asset', async () => {
  let request;
  await updateWebhookSubscription({
    config: { META_GRAPH_VERSION: 'v25.0' },
    provider: 'messenger',
    accountId: 'page-42',
    accessToken: 'page-token',
    subscribe: false,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });
  const url = new URL(request.url);
  assert.equal(request.options.method, 'DELETE');
  assert.equal(url.searchParams.has('subscribed_fields'), false);
});

test('Meta webhook challenge and signed payload use the configured secrets', async (t) => {
  const secret = 'test-meta-app-secret-123456789';
  const verifyToken = 'test-meta-verify-token-123456789';
  const db = {
    async query(sql) {
      if (sql.includes('FROM channel_connections')) return { rows: [], rowCount: 0 };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const app = createApp({
    db,
    config: {
      AUTH_DISABLED: true,
      CORS_ORIGIN: 'https://dashboard.example.com',
      OIDC_ISSUER: 'https://auth.example.com/realms/unified',
      OIDC_JWKS_URL: 'https://auth.example.com/realms/unified/protocol/openid-connect/certs',
      OIDC_CLIENT_ID: 'unified-dashboard',
      BRIDGE_SERVICE_SECRET: 'test-bridge-service-secret-123',
      META_APP_SECRET: secret,
      META_VERIFY_TOKEN: verifyToken,
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const challenge = await fetch(`${base}/webhooks/meta?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=42`);
  assert.equal(challenge.status, 200);
  assert.equal(await challenge.text(), '42');
  const raw = JSON.stringify({ object: 'page', entry: [{ id: 'unknown', messaging: [] }] });
  const signed = await fetch(`${base}/webhooks/meta`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signMetaPayload(Buffer.from(raw), secret) }, body: raw,
  });
  assert.equal(signed.status, 200);
  assert.deepEqual(await signed.json(), { received: true, results: [] });
  const invalid = await fetch(`${base}/webhooks/meta`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=bad' }, body: raw,
  });
  assert.equal(invalid.status, 401);
});
