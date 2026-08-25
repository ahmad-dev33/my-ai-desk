import { chatwootCredential, chatwootRequest, mirrorInboundToChatwoot } from '../chatwoot/meta-mirror.js';
import { upsertMetaContact } from './gateway.js';

async function instagramRequest(config, accessToken, path) {
  const response = await fetch(`https://graph.instagram.com/${config.META_GRAPH_VERSION}${path}`, {
    signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || `Instagram history request failed with ${response.status}`);
    error.code = body.error?.code ? `meta_${body.error.code}` : 'instagram_history_failed';
    error.statusCode = 502;
    throw error;
  }
  return body;
}

async function ensureChatwootInbox({ db, config, channel }) {
  if (channel.chatwoot_account_id && channel.chatwoot_inbox_id) return channel;
  const account = await db.query(
    'SELECT chatwoot_account_id FROM tenant_chatwoot_accounts WHERE tenant_id = $1',
    [channel.tenant_id],
  );
  const accountId = account.rows[0]?.chatwoot_account_id;
  if (!accountId) {
    const error = new Error('The tenant has no Chatwoot account');
    error.code = 'tenant_chatwoot_account_not_configured';
    error.statusCode = 422;
    throw error;
  }
  const connected = { ...channel, chatwoot_account_id: accountId };
  const token = chatwootCredential(config, connected);
  if (!token || token.startsWith('CHANGE_ME')) {
    const error = new Error('Chatwoot API token is not configured');
    error.code = 'chatwoot_credential_missing';
    error.statusCode = 503;
    throw error;
  }
  const inboxName = `Instagram - ${channel.display_name}`;
  const existing = await chatwootRequest(
    config, token, `/api/v1/accounts/${encodeURIComponent(accountId)}/inboxes`,
  );
  const inboxes = existing.payload || existing.data || existing || [];
  let inbox = Array.isArray(inboxes)
    ? inboxes.find((item) => item.name === inboxName && /Api$/i.test(item.channel_type || ''))
    : null;
  if (!inbox) {
    inbox = await chatwootRequest(config, token, `/api/v1/accounts/${encodeURIComponent(accountId)}/inboxes`, {
      method: 'POST',
      body: JSON.stringify({
        name: inboxName,
        enable_auto_assignment: false,
        lock_to_single_conversation: true,
        channel: { type: 'api', webhook_url: '' },
      }),
    });
  }
  const inboxId = inbox.id || inbox.payload?.id;
  if (!inboxId) throw new Error('Chatwoot did not return an inbox ID');
  const updated = await db.query(
    `UPDATE channel_connections SET chatwoot_account_id = $2, chatwoot_inbox_id = $3,
       last_error = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
    [channel.id, accountId, inboxId],
  );
  return updated.rows[0];
}

function messageEvent(channel, message) {
  const accountId = String(channel.external_account_id);
  const fromId = String(message.from?.id || '');
  const recipients = Array.isArray(message.to?.data) ? message.to.data : [];
  const outgoing = fromId === accountId;
  const customer = outgoing
    ? recipients.find((recipient) => String(recipient.id || '') !== accountId)
    : message.from;
  if (!customer?.id || !message.id || !message.message) return null;
  return {
    provider: 'instagram',
    eventId: String(message.id),
    eventType: outgoing ? 'outbound_message' : 'message',
    externalAccountId: accountId,
    senderId: String(customer.id),
    senderName: customer.username || customer.name || null,
    recipientId: outgoing ? String(customer.id) : accountId,
    providerMessageId: String(message.id),
    text: String(message.message).trim(),
    timestamp: Date.parse(message.created_time || '') || Date.now(),
    raw: message,
  };
}

async function claimHistoryEvent(db, channel, event) {
  const result = await db.query(
    `INSERT INTO provider_webhook_events
     (tenant_id, channel_connection_id, provider, provider_event_id, event_type, payload)
     VALUES ($1, $2, 'instagram', $3, $4, $5)
     ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
    [channel.tenant_id, channel.id, event.eventId, event.eventType, JSON.stringify(event.raw)],
  );
  return result.rows[0]?.id || null;
}

export async function syncInstagramHistory({ db, config, channel, accessToken }) {
  const connected = await ensureChatwootInbox({ db, config, channel });
  const conversations = await instagramRequest(
    config,
    accessToken,
    `/${encodeURIComponent(channel.external_account_id)}/conversations?platform=instagram&limit=100`,
  );
  let imported = 0;
  let duplicates = 0;
  for (const conversation of conversations.data || []) {
    const detail = await instagramRequest(
      config,
      accessToken,
      `/${encodeURIComponent(conversation.id)}?fields=messages.limit(20){id,created_time,from,to,message,is_unsupported}`,
    );
    for (const message of [...(detail.messages?.data || [])].reverse()) {
      const event = messageEvent(connected, message);
      if (!event) continue;
      const ledgerId = await claimHistoryEvent(db, connected, event);
      if (!ledgerId) {
        duplicates += 1;
        continue;
      }
      try {
        const contactId = await upsertMetaContact(db, connected, event);
        await mirrorInboundToChatwoot({
          db, config, channel: connected, event, contactId,
          direction: event.eventType === 'outbound_message' ? 'outgoing' : 'incoming',
        });
        await db.query(
          `UPDATE provider_webhook_events SET status = 'processed', processed_at = now() WHERE id = $1`,
          [ledgerId],
        );
        imported += 1;
      } catch (error) {
        await db.query(
          `UPDATE provider_webhook_events SET status = 'failed', error_message = $2, processed_at = now() WHERE id = $1`,
          [ledgerId, String(error.message || error).slice(0, 2000)],
        );
        throw error;
      }
    }
  }
  await db.query(
    `UPDATE channel_connections SET last_health_check_at = now(), last_error = NULL,
       config = config || $2::jsonb, updated_at = now() WHERE id = $1`,
    [connected.id, JSON.stringify({ lastHistorySyncAt: new Date().toISOString() })],
  );
  return { imported, duplicates, conversations: (conversations.data || []).length };
}
