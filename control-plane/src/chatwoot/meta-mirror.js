const parseJson = (value) => {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
};

function credential(config, channel) {
  const byRef = parseJson(config.BRIDGE_CREDENTIALS_JSON);
  const byAccount = parseJson(config.CHATWOOT_TOKENS_JSON);
  const reference = channel.config?.chatwootCredentialRef || channel.credential_ref;
  return byRef[reference] || byAccount[channel.chatwoot_account_id] || config.CHATWOOT_API_TOKEN;
}

async function request(config, token, path, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.CHATWOOT_BASE_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json', api_access_token: token, ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `Chatwoot mirror failed with ${response.status}`);
    error.code = 'chatwoot_meta_mirror_failed';
    error.statusCode = 502;
    throw error;
  }
  return body;
}

function contactShape(body, inboxId) {
  const contact = body.payload?.contact || body.payload || body.contact || body;
  const inbox = body.payload?.contact_inbox
    || contact.contact_inboxes?.find((item) => Number(item.inbox?.id || item.inbox_id) === Number(inboxId))
    || contact.contact_inboxes?.[0];
  return { contactId: contact.id, sourceId: inbox?.source_id };
}

export async function mirrorInboundToChatwoot({ db, config, channel, event, contactId, fetchImpl = fetch }) {
  if (!channel.chatwoot_account_id || !channel.chatwoot_inbox_id) return { skipped: true };
  const token = credential(config, channel);
  if (!token || token.startsWith('CHANGE_ME')) {
    const error = new Error(`No Chatwoot token for Meta channel ${channel.id}`);
    error.code = 'chatwoot_credential_missing';
    throw error;
  }
  let link = await db.query(
    `SELECT * FROM channel_conversation_links
     WHERE channel_connection_id = $1 AND provider_sender_id = $2`,
    [channel.id, event.senderId],
  );
  if (!link.rowCount) {
    const accountId = encodeURIComponent(channel.chatwoot_account_id);
    const createdContact = await request(config, token, `/api/v1/accounts/${accountId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        inbox_id: Number(channel.chatwoot_inbox_id),
        name: event.senderName || `${event.provider} ${event.senderId.slice(-6)}`,
        identifier: `meta:${channel.id}:${event.senderId}`,
        custom_attributes: { provider: event.provider, provider_sender_id: event.senderId },
      }),
    }, fetchImpl);
    const shaped = contactShape(createdContact, channel.chatwoot_inbox_id);
    if (!shaped.contactId || !shaped.sourceId) throw new Error('Chatwoot did not return a contact inbox source ID');
    const conversation = await request(config, token, `/api/v1/accounts/${accountId}/conversations`, {
      method: 'POST',
      body: JSON.stringify({
        source_id: shaped.sourceId,
        inbox_id: Number(channel.chatwoot_inbox_id),
        contact_id: Number(shaped.contactId),
        status: 'open',
      }),
    }, fetchImpl);
    link = await db.query(
      `INSERT INTO channel_conversation_links
       (tenant_id, channel_connection_id, contact_id, provider_sender_id,
        chatwoot_contact_id, chatwoot_source_id, chatwoot_conversation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (channel_connection_id, provider_sender_id) DO UPDATE SET
         contact_id = EXCLUDED.contact_id, chatwoot_contact_id = EXCLUDED.chatwoot_contact_id,
         chatwoot_source_id = EXCLUDED.chatwoot_source_id,
         chatwoot_conversation_id = EXCLUDED.chatwoot_conversation_id, updated_at = now()
       RETURNING *`,
      [channel.tenant_id, channel.id, contactId, event.senderId, shaped.contactId,
        shaped.sourceId, conversation.id || conversation.payload?.id],
    );
  }
  const row = link.rows[0];
  await request(config, token,
    `/api/v1/accounts/${encodeURIComponent(channel.chatwoot_account_id)}/conversations/${encodeURIComponent(row.chatwoot_conversation_id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: event.text,
        message_type: 'incoming',
        private: false,
        content_type: 'text',
        source_id: event.eventId,
      }),
    }, fetchImpl);
  return { skipped: false, conversationId: row.chatwoot_conversation_id };
}

export async function mirrorOutboundToChatwoot({ db, config, channel, message, fetchImpl = fetch }) {
  if (!channel.chatwoot_account_id || !channel.chatwoot_inbox_id) return { skipped: true };
  const token = credential(config, channel);
  if (!token || token.startsWith('CHANGE_ME')) return { skipped: true };
  const link = await db.query(
    `SELECT chatwoot_conversation_id FROM channel_conversation_links
     WHERE channel_connection_id = $1 AND provider_sender_id = $2`,
    [message.channel_connection_id, message.provider_recipient_id],
  );
  if (!link.rowCount || !link.rows[0].chatwoot_conversation_id) return { skipped: true };
  await request(config, token,
    `/api/v1/accounts/${encodeURIComponent(channel.chatwoot_account_id)}/conversations/${encodeURIComponent(link.rows[0].chatwoot_conversation_id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: message.content?.text,
        message_type: 'outgoing',
        private: false,
        content_type: 'text',
        source_id: message.provider_message_id || message.id,
      }),
    }, fetchImpl);
  return { skipped: false };
}
