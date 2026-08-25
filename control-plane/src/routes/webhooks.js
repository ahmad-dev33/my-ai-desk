import crypto from 'node:crypto';
import { Router } from 'express';
import { getIncomingMessage } from '../bridge/webhook.js';
import { extractTypebotReplies } from '../bridge/replies.js';
import { createBridgeQueue } from '../bridge/queue.js';

function secureEqual(left = '', right = '') {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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

const parseJson = (str, fallback = {}) => {
  try { return JSON.parse(str || '{}'); } catch { return fallback; }
};

export function bridgeMessageIdempotencyKey(message) {
  const scope = [message.accountId, message.inboxId, message.conversationId, message.messageId]
    .map((value) => encodeURIComponent(String(value)));
  return `bridge:message:${scope.join(':')}`;
}

export function webhookRoutes({ db, config, redis }) {
  const router = Router();
  const webhookSecret = config.WEBHOOK_SHARED_SECRET || config.BRIDGE_SERVICE_SECRET;
  const tenantTokens = parseJson(config.CHATWOOT_TOKENS_JSON);
  const credentialTokens = parseJson(config.BRIDGE_CREDENTIALS_JSON);
  const ttl = Number(config.SESSION_TTL_SECONDS || 604800);

  const startTypebot = (publicId, message) => fetchJson(
    `${config.TYPEBOT_BASE_URL}/api/v1/typebots/${encodeURIComponent(publicId)}/startChat`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { type: 'text', text: message }, textBubbleContentFormat: 'markdown' }),
    },
  );

  const continueTypebot = (sessionId, message) => fetchJson(
    `${config.TYPEBOT_BASE_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}/continueChat`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { type: 'text', text: message }, textBubbleContentFormat: 'markdown' }),
    },
  );

  const sendChatwootReply = (accountId, conversationId, content, token) => fetchJson(
    `${config.CHATWOOT_BASE_URL}/api/v1/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', api_access_token: token },
      body: JSON.stringify({ content, message_type: 'outgoing', private: false, content_type: 'text' }),
    },
  );

  const getBridgeRoute = async (message) => {
    const result = await db.query(
      `SELECT cc.id AS channel_connection_id, cc.tenant_id, cc.provider,
              cc.credential_ref, cc.chatwoot_account_id, cc.chatwoot_inbox_id,
              ad.id AS automation_id, ad.engine, ad.engine_ref AS typebot_public_id,
              ad.current_version
       FROM channel_connections cc
       JOIN automation_definitions ad ON ad.id = cc.automation_id AND ad.tenant_id = cc.tenant_id
       WHERE cc.chatwoot_account_id = $1
         AND cc.chatwoot_inbox_id = $2
         AND cc.status = 'active'
         AND ad.status = 'published'
       LIMIT 1`,
      [message.accountId, message.inboxId],
    );
    if (!result.rowCount) throw new Error('bridge_route_not_found');
    return result.rows[0];
  };

  const processMessage = async (message) => {
    const idempotencyKey = bridgeMessageIdempotencyKey(message);
    if (redis) {
      const claimed = await redis.set(idempotencyKey, 'processing', { NX: true, EX: 300 });
      if (!claimed) return { duplicate: true };
    }

    try {
      const route = await getBridgeRoute(message);
      if (!route.typebot_public_id) throw new Error('Bridge route has no published Typebot public ID');

      const sessionKey = `bridge:session:${route.tenant_id}:${route.channel_connection_id}:${message.conversationId}`;
      let sessionId = redis ? await redis.get(sessionKey) : null;
      let typebotResponse;

      if (sessionId) {
        try {
          typebotResponse = await continueTypebot(sessionId, message.content);
        } catch (error) {
          if (error.status !== 404) throw error;
          if (redis) await redis.del(sessionKey);
          sessionId = null;
        }
      }

      if (!sessionId) {
        typebotResponse = await startTypebot(route.typebot_public_id, message.content);
        sessionId = typebotResponse.sessionId;
      }

      if (sessionId && redis) await redis.set(sessionKey, sessionId, { EX: ttl });

      const token = credentialTokens[route.credential_ref]
        || tenantTokens[message.accountId]
        || config.CHATWOOT_API_TOKEN;

      if (!token || token.startsWith('CHANGE_ME')) {
        throw new Error(`No Chatwoot credential for route ${route.channel_connection_id}`);
      }

      for (const reply of extractTypebotReplies(typebotResponse)) {
        await sendChatwootReply(message.accountId, message.conversationId, reply, token);
      }

      if (redis) await redis.set(idempotencyKey, 'done', { EX: 86400 });
      return { duplicate: false };
    } catch (error) {
      if (redis) await redis.del(idempotencyKey);
      throw error;
    }
  };

  const bridgeQueue = createBridgeQueue({
    redis,
    processMessage,
  });

  router.post('/webhooks/chatwoot', async (req, res) => {
    const supplied = req.query.token || req.get('x-webhook-token') || '';
    if (!secureEqual(supplied, webhookSecret)) {
      return res.status(401).json({ error: 'invalid webhook token' });
    }
    const message = getIncomingMessage(req.body);
    if (!message) return res.status(204).end();

    try {
      const result = await bridgeQueue.enqueue(message);
      if (result && result.duplicate) return res.status(202).end();
      return res.status(204).end();
    } catch (error) {
      req.log?.error({ messageId: message.messageId, err: error }, 'Bridge message processing failed');
      return res.status(502).json({ error: 'bridge processing failed' });
    }
  });

  return router;
}
