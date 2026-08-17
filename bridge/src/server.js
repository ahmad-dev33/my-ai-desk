import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createClient } from 'redis';
import { extractTypebotReplies } from './replies.js';
import { getIncomingMessage } from './webhook.js';
export { extractTypebotReplies } from './replies.js';

const required = [
  'WEBHOOK_SHARED_SECRET', 'CHATWOOT_BASE_URL', 'TYPEBOT_BASE_URL', 'REDIS_URL',
  'CONTROL_PLANE_BASE_URL', 'CONTROL_PLANE_SERVICE_SECRET',
];

const assertConfiguration = () => {
  const missing = required.filter((name) => !process.env[name] || process.env[name].startsWith('CHANGE_ME'));
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
};

const secureEqual = (left = '', right = '') => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(120000) });
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { raw: body }; }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 500)}`);
    error.status = response.status;
    error.body = parsed;
    throw error;
  }
  return parsed;
};

const parseTenantTokens = () => {
  try { return JSON.parse(process.env.CHATWOOT_TOKENS_JSON || '{}'); }
  catch { throw new Error('CHATWOOT_TOKENS_JSON must be a valid JSON object'); }
};

const startTypebot = (publicId, message) => fetchJson(
  `${process.env.TYPEBOT_BASE_URL}/api/v1/typebots/${encodeURIComponent(publicId)}/startChat`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { type: 'text', text: message }, textBubbleContentFormat: 'markdown' }),
  },
);

const continueTypebot = (sessionId, message) => fetchJson(
  `${process.env.TYPEBOT_BASE_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}/continueChat`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { type: 'text', text: message }, textBubbleContentFormat: 'markdown' }),
  },
);

const sendChatwootReply = (accountId, conversationId, content, token) => fetchJson(
  `${process.env.CHATWOOT_BASE_URL}/api/v1/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', api_access_token: token },
    body: JSON.stringify({ content, message_type: 'outgoing', private: false, content_type: 'text' }),
  },
);

const getBridgeRoute = (message) => fetchJson(
  `${process.env.CONTROL_PLANE_BASE_URL}/internal/v1/bridge/routes/chatwoot/${encodeURIComponent(message.accountId)}/inboxes/${encodeURIComponent(message.inboxId)}`,
  { headers: { 'x-bridge-token': process.env.CONTROL_PLANE_SERVICE_SECRET } },
).then((response) => response.data);

export async function createServer() {
  assertConfiguration();
  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', (error) => console.error(JSON.stringify({ level: 'error', source: 'redis', error: error.message })));
  await redis.connect();

  const tenantTokens = parseTenantTokens();
  const credentialTokens = (() => {
    try { return JSON.parse(process.env.BRIDGE_CREDENTIALS_JSON || '{}'); }
    catch { throw new Error('BRIDGE_CREDENTIALS_JSON must be a valid JSON object'); }
  })();
  const ttl = Number(process.env.SESSION_TTL_SECONDS || 604800);
  const queues = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  const processMessage = async (message) => {
    const idempotencyKey = `bridge:message:${message.messageId}`;
    const claimed = await redis.set(idempotencyKey, 'processing', { NX: true, EX: 300 });
    if (!claimed) return { duplicate: true };

    try {
      const route = await getBridgeRoute(message);
      if (!route.typebot_public_id) throw new Error('Bridge route has no published Typebot public ID');
      const sessionKey = `bridge:session:${route.tenant_id}:${route.channel_connection_id}:${message.conversationId}`;
      let sessionId = await redis.get(sessionKey);
      let typebotResponse;
      if (sessionId) {
        try {
          typebotResponse = await continueTypebot(sessionId, message.content);
        } catch (error) {
          if (error.status !== 404) throw error;
          await redis.del(sessionKey);
          sessionId = null;
        }
      }
      if (!sessionId) {
        typebotResponse = await startTypebot(route.typebot_public_id, message.content);
        sessionId = typebotResponse.sessionId;
      }
      if (sessionId) await redis.set(sessionKey, sessionId, { EX: ttl });

      const token = credentialTokens[route.credential_ref]
        || tenantTokens[message.accountId]
        || process.env.CHATWOOT_API_TOKEN;
      if (!token || token.startsWith('CHANGE_ME')) {
        throw new Error(`No Chatwoot credential for route ${route.channel_connection_id}`);
      }
      for (const reply of extractTypebotReplies(typebotResponse)) {
        await sendChatwootReply(message.accountId, message.conversationId, reply, token);
      }
      await redis.set(idempotencyKey, 'done', { EX: 86400 });
      return { duplicate: false };
    } catch (error) {
      await redis.del(idempotencyKey);
      throw error;
    }
  };

  const enqueue = (message) => {
    const key = `${message.accountId}:${message.conversationId}`;
    const previous = queues.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => processMessage(message));
    queues.set(key, current);
    current.finally(() => { if (queues.get(key) === current) queues.delete(key); });
    return current;
  };

  app.get('/healthz', async (_req, res) => {
    try { await redis.ping(); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  app.post('/webhooks/chatwoot', async (req, res) => {
    const supplied = req.query.token || req.get('x-webhook-token') || '';
    if (!secureEqual(supplied, process.env.WEBHOOK_SHARED_SECRET)) return res.status(401).json({ error: 'invalid webhook token' });
    const message = getIncomingMessage(req.body);
    if (!message) return res.status(204).end();
    try {
      const result = await enqueue(message);
      return res.status(result.duplicate ? 202 : 204).end();
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', messageId: message.messageId, error: error.message }));
      return res.status(502).json({ error: 'bridge processing failed' });
    }
  });

  return { app, redis };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app } = await createServer();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`bridge listening on ${port}`));
}
