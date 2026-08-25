import { Router } from 'express';
import { assertTenantAccess } from '../access.js';
import { answerTenantQuestion } from '../ai/tenant-answer.js';
import { evaluateKeywords } from '../manychat/parity-engine.js';
import { applyProviderReceipt, enqueueOutboundMessage } from '../outbox/outbox.js';
import { mirrorInboundToChatwoot } from '../chatwoot/meta-mirror.js';
import { normalizeMetaPayload } from './normalize.js';
import { secureEqual, verifyMetaSignature } from './security.js';

const parseJson = (value, fallback = {}) => {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
};

const conversationalEventTypes = new Set(['message', 'postback']);
const mirroredEventTypes = new Set(['message', 'outbound_message', 'postback', 'comment', 'live_comment', 'standby_message', 'standby_postback']);
const pausedEventTypes = new Set(['pass_thread_control', 'request_thread_control', 'messaging_handover', 'standby_event', 'standby_message', 'standby_postback']);

async function resolveChannel(db, event) {
  const result = await db.query(
    `SELECT * FROM channel_connections
     WHERE provider = $1 AND external_account_id = $2 AND status = 'active'
     LIMIT 1`,
    [event.provider, event.externalAccountId],
  );
  return result.rows[0] || null;
}

async function claimEvent(db, channel, event) {
  const result = await db.query(
    `INSERT INTO provider_webhook_events
     (tenant_id, channel_connection_id, provider, provider_event_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (provider, provider_event_id) DO UPDATE SET
       status = 'received', error_message = NULL
     WHERE provider_webhook_events.status = 'failed'
     RETURNING id`,
    [channel.tenant_id, channel.id, event.provider, event.eventId, event.eventType, JSON.stringify(event.raw || {})],
  );
  return result.rows[0]?.id || null;
}

export async function upsertMetaContact(db, channel, event) {
  return db.transaction(async (client) => {
    const existing = await client.query(
      `SELECT ci.contact_id, cp.display_name
       FROM contact_identities ci JOIN contact_profiles cp ON cp.id = ci.contact_id
       WHERE ci.tenant_id = $1 AND ci.provider = $2 AND ci.external_id = $3`,
      [channel.tenant_id, event.provider, event.senderId],
    );
    if (existing.rowCount) return existing.rows[0].contact_id;
    const displayName = event.senderName || `${event.provider} ${event.senderId.slice(-6)}`;
    const contact = await client.query(
      `INSERT INTO contact_profiles (tenant_id, display_name, status, custom_fields)
       VALUES ($1, $2, 'active', $3) RETURNING id`,
      [channel.tenant_id, displayName, JSON.stringify({ source: event.provider })],
    );
    await client.query(
      `INSERT INTO contact_identities (tenant_id, contact_id, provider, external_id, username, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [channel.tenant_id, contact.rows[0].id, event.provider, event.senderId,
        event.senderName || null, JSON.stringify({ channelConnectionId: channel.id })],
    );
    return contact.rows[0].id;
  });
}

async function openMessagingWindow(db, channel, event, contactId) {
  await db.query(
    `INSERT INTO channel_contact_permissions
     (tenant_id, channel_connection_id, contact_id, provider_recipient_id,
      last_user_message_at, messaging_window_expires_at, consent_source)
     VALUES ($1, $2, $3, $4, now(), now() + interval '24 hours', 'user_initiated_message')
     ON CONFLICT (channel_connection_id, contact_id) DO UPDATE SET
       provider_recipient_id = EXCLUDED.provider_recipient_id,
       last_user_message_at = now(), messaging_window_expires_at = now() + interval '24 hours',
       consent_source = 'user_initiated_message', updated_at = now()`,
    [channel.tenant_id, channel.id, contactId, event.senderId],
  );
}

async function recordContactEventState(db, channel, event, contactId) {
  const nextAutomationState = pausedEventTypes.has(event.eventType)
    ? 'paused'
    : event.eventType === 'take_thread_control' ? 'active' : null;
  const providerContext = {
    lastEventType: event.eventType,
    ...(event.referral ? { referral: event.referral } : {}),
    ...(event.optin ? { optin: event.optin } : {}),
    ...(event.control ? { control: event.control } : {}),
    ...(event.providerMessageId ? { providerMessageId: event.providerMessageId } : {}),
  };
  await db.query(
    `INSERT INTO channel_contact_permissions
     (tenant_id, channel_connection_id, contact_id, provider_recipient_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_connection_id, contact_id) DO NOTHING`,
    [channel.tenant_id, channel.id, contactId, event.senderId],
  );
  const result = await db.query(
    `UPDATE channel_contact_permissions SET
       provider_recipient_id = $4,
       automation_state = COALESCE($5, automation_state),
       marketing_opt_in_at = CASE WHEN $6 THEN now() ELSE marketing_opt_in_at END,
       consent_source = CASE WHEN $6 THEN 'meta_messaging_optin' ELSE consent_source END,
       last_provider_event_type = $7,
       last_provider_event_at = now(),
       provider_context = provider_context || $8::jsonb,
       updated_at = now()
     WHERE channel_connection_id = $2 AND contact_id = $3
     RETURNING automation_state`,
    [channel.tenant_id, channel.id, contactId, event.senderId, nextAutomationState,
      event.eventType === 'messaging_optin', event.eventType, JSON.stringify(providerContext)],
  );
  return result.rows[0]?.automation_state || 'active';
}

function keywordReply(rule) {
  const payload = typeof rule.action_payload === 'string' ? parseJson(rule.action_payload) : rule.action_payload || {};
  return payload.replyText || payload.text || payload.message || null;
}

async function decideReply({ db, config, channel, event, contactId }) {
  const rule = await evaluateKeywords(db, channel.tenant_id, event.text, event.provider);
  if (rule?.action_type === 'send_reply') {
    const reply = keywordReply(rule);
    if (reply) return { action: 'keyword_reply', reply, ruleId: rule.id };
  }
  if (rule?.action_type === 'handoff_human') {
    const policy = await db.query('SELECT fallback_reply FROM ai_handoff_policies WHERE tenant_id = $1', [channel.tenant_id]);
    return { action: 'handoff', reply: policy.rows[0]?.fallback_reply || 'سأحوّل المحادثة إلى موظف لمساعدتك.' };
  }
  return answerTenantQuestion({
    db,
    config,
    tenantId: channel.tenant_id,
    question: event.text,
    channelConnectionId: channel.id,
    contactId,
    inboundMessageId: event.eventId,
  });
}

export function createMetaGateway({ db, config }) {
  async function processPayload(payload, logger = console) {
    const normalized = normalizeMetaPayload(payload);
    const results = [];
    for (const event of normalized) {
      const channel = await resolveChannel(db, event);
      if (!channel) {
        results.push({ eventId: event.eventId, status: 'unrouted' });
        continue;
      }
      const ledgerId = await claimEvent(db, channel, event);
      if (!ledgerId) {
        results.push({ eventId: event.eventId, status: 'duplicate' });
        continue;
      }
      try {
        if (['delivered', 'read'].includes(event.eventType)) {
          await applyProviderReceipt(db, { ...event, channelConnectionId: channel.id });
          await db.query(
            `UPDATE provider_webhook_events SET status = 'processed', processed_at = now() WHERE id = $1`,
            [ledgerId],
          );
          results.push({ eventId: event.eventId, status: 'processed', eventType: event.eventType });
          continue;
        }
        if (!event.senderId) {
          await db.query(
            `UPDATE provider_webhook_events SET status = 'processed', processed_at = now() WHERE id = $1`,
            [ledgerId],
          );
          results.push({ eventId: event.eventId, status: 'processed', action: 'event_recorded' });
          continue;
        }
        const contactId = await upsertMetaContact(db, channel, event);
        if (conversationalEventTypes.has(event.eventType)) await openMessagingWindow(db, channel, event, contactId);
        const automationState = await recordContactEventState(db, channel, event, contactId);
        if (mirroredEventTypes.has(event.eventType) && event.text) {
          await mirrorInboundToChatwoot({
            db, config, channel, event, contactId,
            direction: event.eventType === 'outbound_message' ? 'outgoing' : 'incoming',
          });
        }
        // Comment-to-DM uses provider-specific private-reply endpoints and review rules.
        // Never send a normal Messenger/Instagram DM merely because someone commented.
        const decision = ['comment', 'live_comment'].includes(event.eventType)
          ? { action: 'comment_pending_review', reply: null }
          : conversationalEventTypes.has(event.eventType) && event.text && automationState === 'active'
            ? await decideReply({ db, config, channel, event, contactId })
            : conversationalEventTypes.has(event.eventType) && automationState === 'paused'
              ? { action: 'automation_paused', reply: null }
              : { action: 'event_recorded', reply: null };
        const outbox = decision.reply ? await enqueueOutboundMessage(db, {
          tenantId: channel.tenant_id,
          channelConnectionId: channel.id,
          contactId,
          recipientId: event.senderId,
          replyToMessageId: event.eventId,
          text: decision.reply,
          idempotencyKey: `meta-reply:${event.provider}:${event.eventId}`,
          maxAttempts: config.OUTBOX_MAX_ATTEMPTS,
        }) : null;
        await db.query(
          `UPDATE provider_webhook_events SET status = 'processed', processed_at = now() WHERE id = $1`,
          [ledgerId],
        );
        await db.query(
          `UPDATE channel_connections SET last_event_at = now(), last_error = NULL, updated_at = now() WHERE id = $1`,
          [channel.id],
        );
        results.push({ eventId: event.eventId, status: 'processed', action: decision.action, outboxMessageId: outbox?.id });
      } catch (error) {
        await db.query(
          `UPDATE provider_webhook_events SET status = 'failed', error_message = $2, processed_at = now() WHERE id = $1`,
          [ledgerId, String(error.message || error).slice(0, 2000)],
        );
        await db.query(
          `UPDATE channel_connections SET last_error = $2, updated_at = now() WHERE id = $1`,
          [channel.id, String(error.message || error).slice(0, 2000)],
        );
        logger.error?.({ err: error, metaEventId: event.eventId }, 'Meta event processing failed');
        results.push({ eventId: event.eventId, status: 'failed' });
      }
    }
    return results;
  }
  return { processPayload };
}

export function metaPublicRoutes({ db, config }) {
  const router = Router();
  const gateway = createMetaGateway({ db, config });

  router.get('/webhooks/meta', (req, res) => {
    if (req.query['hub.mode'] !== 'subscribe'
      || !secureEqual(req.query['hub.verify_token'], config.META_VERIFY_TOKEN || '')) {
      return res.status(403).json({ error: 'meta_verification_failed' });
    }
    return res.status(200).send(String(req.query['hub.challenge'] || ''));
  });

  router.post('/webhooks/meta', async (req, res) => {
    const signingSecrets = [...new Set([
      config.META_INSTAGRAM_APP_SECRET,
      config.META_APP_SECRET,
    ].filter(Boolean))];
    if (!signingSecrets.length) return res.status(503).json({ error: 'meta_not_configured' });
    if (!signingSecrets.some((secret) => verifyMetaSignature(req.rawBody, req.get('x-hub-signature-256'), secret))) {
      return res.status(401).json({ error: 'invalid_meta_signature' });
    }
    const results = await gateway.processPayload(req.body, req.log);
    return res.status(200).json({ received: true, results });
  });

  return router;
}

export function metaTenantRoutes({ db, config }) {
  const router = Router({ mergeParams: true });

  router.get('/status', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const [channels, outbound, events, decisions] = await Promise.all([
      db.query(
        `SELECT id, provider, external_account_id, display_name, status, credential_ref,
                config, last_health_check_at, last_event_at, last_error, updated_at
         FROM channel_connections WHERE tenant_id = $1 AND provider IN ('messenger','instagram','whatsapp')
         ORDER BY updated_at DESC`, [req.params.tenantId],
      ),
      db.query(
        `SELECT id, channel_connection_id, provider_recipient_id, content, status, attempt_count,
                provider_message_id, last_error, created_at, sent_at, delivered_at, read_at
         FROM outbound_messages WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.tenantId],
      ),
      db.query(
        `SELECT id, channel_connection_id, provider, provider_event_id, event_type, status,
                error_message, received_at, processed_at
         FROM provider_webhook_events WHERE tenant_id = $1 ORDER BY received_at DESC LIMIT 50`, [req.params.tenantId],
      ),
      db.query(
        `SELECT id, action, confidence, model, source_document_ids, source_product_ids,
                latency_ms, occurred_at
         FROM ai_decision_events WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT 50`, [req.params.tenantId],
      ),
    ]);
    const requiredSettings = [
      ['META_INSTAGRAM_APP_ID_OR_META_APP_ID', config.META_INSTAGRAM_APP_ID || config.META_APP_ID],
      ['META_INSTAGRAM_APP_SECRET_OR_META_APP_SECRET', config.META_INSTAGRAM_APP_SECRET || config.META_APP_SECRET],
      ['META_VERIFY_TOKEN', config.META_VERIFY_TOKEN],
      ['META_OAUTH_REDIRECT_URI', config.META_OAUTH_REDIRECT_URI],
      ['CREDENTIAL_ENCRYPTION_KEY', config.CREDENTIAL_ENCRYPTION_KEY],
    ];
    const missingSettings = requiredSettings.filter(([, value]) => !value).map(([name]) => name);
    let webhookUrl = null;
    if (config.META_OAUTH_REDIRECT_URI) {
      const callback = new URL(config.META_OAUTH_REDIRECT_URI);
      callback.pathname = '/webhooks/meta';
      callback.search = '';
      webhookUrl = callback.toString();
    }
    return res.json({ data: {
      channels: channels.rows,
      outbound: outbound.rows,
      events: events.rows,
      decisions: decisions.rows,
      configuration: {
        ready: missingSettings.length === 0,
        missingSettings,
        graphVersion: config.META_GRAPH_VERSION,
        oauthRedirectUri: config.META_OAUTH_REDIRECT_URI || null,
        webhookUrl,
        publicHttps: Boolean(config.META_OAUTH_REDIRECT_URI?.startsWith('https://')),
      },
    } });
  });

  return router;
}
