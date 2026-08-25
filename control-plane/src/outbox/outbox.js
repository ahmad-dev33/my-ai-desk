import { mirrorOutboundToChatwoot } from '../chatwoot/meta-mirror.js';
import { resolveCredential } from '../credentials/store.js';

function parseCredentials(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

export async function enqueueOutboundMessage(db, message) {
  const result = await db.query(
    `INSERT INTO outbound_messages
     (tenant_id, channel_connection_id, contact_id, provider_recipient_id,
      reply_to_provider_message_id, content, idempotency_key, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = outbound_messages.updated_at
     RETURNING *`,
    [message.tenantId, message.channelConnectionId, message.contactId || null,
      message.recipientId, message.replyToMessageId || null, JSON.stringify({ text: message.text }),
      message.idempotencyKey, message.maxAttempts || 5],
  );
  return result.rows[0];
}

function metaEndpoint(config, channel) {
  const graphVersion = config.META_GRAPH_VERSION;
  const channelConfig = channel.config || {};
  if (channel.provider === 'instagram') {
    if (channelConfig.graphMode === 'facebook_login') {
      return `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(channel.external_account_id)}/messages`;
    }
    return `https://graph.instagram.com/${graphVersion}/${encodeURIComponent(channel.external_account_id)}/messages`;
  }
  if (channel.provider === 'whatsapp') {
    const phoneNumberId = channelConfig.phoneNumberId || channel.external_account_id;
    return `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
  }
  return `https://graph.facebook.com/${graphVersion}/me/messages`;
}

function requestBody(channel, message) {
  const text = message.content?.text || '';
  if (channel.provider === 'whatsapp') {
    return { messaging_product: 'whatsapp', to: message.provider_recipient_id, type: 'text', text: { body: text } };
  }
  return { recipient: { id: message.provider_recipient_id }, message: { text }, messaging_type: 'RESPONSE' };
}

function retryAfterSeconds(response) {
  const value = response.headers?.get?.('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : 0;
}

function usageBackoffSeconds(response) {
  const names = ['x-app-usage', 'x-page-usage'];
  for (const name of names) {
    const value = response.headers?.get?.(name);
    if (!value) continue;
    try {
      const usage = Object.values(JSON.parse(value)).map(Number).filter(Number.isFinite);
      if (usage.some((percentage) => percentage >= 90)) return 60;
    } catch {
      // Invalid provider telemetry must not fail an otherwise valid delivery.
    }
  }
  return 0;
}

export async function deliverOutboundMessage({ config, channel, message, providerCredential = null, fetchImpl = fetch }) {
  const credentials = parseCredentials(config.META_CREDENTIALS_JSON);
  const credential = providerCredential || credentials[channel.credential_ref];
  const accessToken = typeof credential === 'string' ? credential : credential?.accessToken;
  if (!accessToken) {
    const error = new Error(`No Meta credential for reference ${channel.credential_ref || '(missing)'}`);
    error.code = 'meta_credential_missing';
    throw error;
  }
  const response = await fetchImpl(metaEndpoint(config, channel), {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(requestBody(channel, message)),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || `Meta delivery failed with ${response.status}`);
    error.code = body.error?.code ? `meta_${body.error.code}` : 'meta_delivery_failed';
    error.retryable = response.status === 429 || response.status >= 500;
    error.retryAfterSeconds = Math.max(retryAfterSeconds(response), usageBackoffSeconds(response));
    throw error;
  }
  return {
    providerMessageId: body.message_id || body.messages?.[0]?.id || body.recipient_id,
    providerBackoffSeconds: usageBackoffSeconds(response),
    response: body,
  };
}

async function claimNext(db, config) {
  const channelIntervalMs = Number(config.META_OUTBOUND_CHANNEL_INTERVAL_MS || 1000);
  const contactCooldownMs = Number(config.META_OUTBOUND_CONTACT_COOLDOWN_MS || 1500);
  const replyWindowMs = Number(config.META_OUTBOUND_REPLY_WINDOW_MS || 600000);
  const maxReplies = Number(config.META_OUTBOUND_MAX_REPLIES_PER_WINDOW || 6);
  return db.transaction(async (client) => {
    await client.query(
      `UPDATE outbound_messages om SET status = 'dead',
       last_error = 'provider_messaging_window_expired', updated_at = now()
       FROM channel_connections cc
       WHERE om.channel_connection_id = cc.id AND om.status IN ('pending', 'failed')
         AND cc.provider IN ('messenger', 'instagram', 'whatsapp')
         AND NOT EXISTS (
           SELECT 1 FROM channel_contact_permissions permission
           WHERE permission.channel_connection_id = om.channel_connection_id
             AND permission.contact_id = om.contact_id
             AND permission.messaging_window_expires_at > now()
         )`,
    );
    const result = await client.query(
      `SELECT om.*, cc.provider, cc.external_account_id, cc.credential_ref, cc.config,
              cc.chatwoot_account_id, cc.chatwoot_inbox_id
       FROM outbound_messages om
       JOIN channel_connections cc ON cc.id = om.channel_connection_id AND cc.tenant_id = om.tenant_id
       LEFT JOIN channel_contact_permissions permission
         ON permission.channel_connection_id = om.channel_connection_id
        AND permission.contact_id = om.contact_id
       WHERE ((om.status IN ('pending', 'failed') AND om.next_attempt_at <= now())
          OR (om.status = 'processing' AND om.locked_at < now() - interval '5 minutes'))
         AND om.attempt_count < om.max_attempts AND cc.status = 'active'
         AND permission.messaging_window_expires_at > now()
         AND NOT EXISTS (
           SELECT 1 FROM outbound_messages recent_channel
           WHERE recent_channel.channel_connection_id = om.channel_connection_id
             AND recent_channel.sent_at > now() - ($1 * interval '1 millisecond')
         )
         AND NOT EXISTS (
           SELECT 1 FROM outbound_messages recent_contact
           WHERE recent_contact.channel_connection_id = om.channel_connection_id
             AND recent_contact.contact_id = om.contact_id
             AND recent_contact.sent_at > now() - ($2 * interval '1 millisecond')
         )
         AND (
           SELECT count(*) FROM outbound_messages reply_window
           WHERE reply_window.channel_connection_id = om.channel_connection_id
             AND reply_window.contact_id = om.contact_id
             AND reply_window.sent_at > now() - ($3 * interval '1 millisecond')
         ) < $4
       ORDER BY om.created_at ASC
       FOR UPDATE OF om SKIP LOCKED LIMIT 1`,
      [channelIntervalMs, contactCooldownMs, replyWindowMs, maxReplies],
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    await client.query(
      `UPDATE outbound_messages SET status = 'processing', locked_at = now(),
       attempt_count = attempt_count + 1, updated_at = now() WHERE id = $1`,
      [row.id],
    );
    return { ...row, attempt_count: Number(row.attempt_count) + 1 };
  });
}

async function markFailure(db, message, error) {
  const dead = !error.retryable || message.attempt_count >= message.max_attempts;
  const exponentialDelay = 2 ** Math.max(0, message.attempt_count - 1) * 5;
  const providerDelay = Number(error.retryAfterSeconds || 0);
  const delaySeconds = Math.min(86400, Math.max(exponentialDelay, providerDelay));
  await db.query(
    `UPDATE outbound_messages SET status = $2, last_error = $3, locked_at = NULL,
     next_attempt_at = now() + ($4 * interval '1 second'), updated_at = now() WHERE id = $1`,
    [message.id, dead ? 'dead' : 'failed', String(error.message || error).slice(0, 2000), delaySeconds],
  );
}

export function createOutboxWorker({ db, config, logger = console, fetchImpl = fetch, autoStart = true }) {
  let timer = null;
  let running = false;
  let stopped = false;
  let providerBackoffUntil = 0;

  const processNext = async () => {
    if (running || stopped || Date.now() < providerBackoffUntil) return false;
    running = true;
    try {
      const message = await claimNext(db, config);
      if (!message) return false;
      try {
        const providerCredential = await resolveCredential(db, config, message.credential_ref);
        const delivered = await deliverOutboundMessage({
          config,
          fetchImpl,
          message,
          providerCredential,
          channel: {
            provider: message.provider,
            external_account_id: message.external_account_id,
            credential_ref: message.credential_ref,
            config: message.config || {},
            chatwoot_account_id: message.chatwoot_account_id,
            chatwoot_inbox_id: message.chatwoot_inbox_id,
          },
        });
        await db.query(
          `UPDATE outbound_messages SET status = 'sent', provider_message_id = $2,
           provider_response = $3, sent_at = now(), locked_at = NULL, last_error = NULL,
           updated_at = now() WHERE id = $1`,
          [message.id, delivered.providerMessageId, JSON.stringify(delivered.response || {})],
        );
        if (delivered.providerBackoffSeconds > 0) {
          providerBackoffUntil = Date.now() + delivered.providerBackoffSeconds * 1000;
        }
        try {
          await mirrorOutboundToChatwoot({
            db,
            config,
            fetchImpl,
            message: { ...message, provider_message_id: delivered.providerMessageId },
            channel: {
              provider: message.provider,
              external_account_id: message.external_account_id,
              credential_ref: message.credential_ref,
              config: message.config || {},
              chatwoot_account_id: message.chatwoot_account_id,
              chatwoot_inbox_id: message.chatwoot_inbox_id,
            },
          });
        } catch (error) {
          logger.error?.({ err: error, outboxMessageId: message.id }, 'Meta reply sent but Chatwoot mirror failed');
        }
        return true;
      } catch (error) {
        await markFailure(db, message, error);
        if (error.retryAfterSeconds > 0) {
          providerBackoffUntil = Date.now() + error.retryAfterSeconds * 1000;
        }
        logger.error?.({ err: error, outboxMessageId: message.id }, 'Meta outbox delivery failed');
        return true;
      }
    } finally {
      running = false;
    }
  };

  const tick = async () => {
    try {
      while (await processNext()) { /* drain ready jobs serially */ }
    } catch (error) {
      logger.error?.({ err: error }, 'Meta outbox worker tick failed');
    }
  };

  if (autoStart) {
    timer = setInterval(tick, config.OUTBOX_POLL_INTERVAL_MS);
    timer.unref?.();
    void tick();
  }
  return {
    processNext,
    stop() { stopped = true; if (timer) clearInterval(timer); },
  };
}

export async function applyProviderReceipt(db, event) {
  if (!event.providerMessageId) return false;
  const column = event.eventType === 'read' ? 'read_at' : 'delivered_at';
  const status = event.eventType === 'read' ? 'read' : 'delivered';
  const result = await db.query(
    `UPDATE outbound_messages SET status = $1, ${column} = now(), updated_at = now()
     WHERE channel_connection_id = $2 AND provider_message_id = $3
       AND status NOT IN ('dead', 'cancelled') RETURNING id`,
    [status, event.channelConnectionId, event.providerMessageId],
  );
  return Boolean(result.rowCount);
}
