import crypto from 'node:crypto';

function stableEventId(parts) {
  return crypto.createHash('sha256').update(parts.filter(Boolean).join(':')).digest('hex');
}

function messagingEvents(object, entry) {
  const provider = object === 'instagram' ? 'instagram' : 'messenger';
  return (entry.messaging || []).flatMap((item) => {
    const accountId = String(entry.id || item.recipient?.id || '');
    if (item.message && !item.message.is_echo) {
      const eventId = item.message.mid || stableEventId([provider, accountId, item.sender?.id, item.timestamp, item.message.text]);
      return [{
        provider,
        eventId,
        eventType: 'message',
        externalAccountId: accountId,
        senderId: String(item.sender?.id || ''),
        senderName: item.sender_name || null,
        recipientId: String(item.recipient?.id || accountId),
        text: String(item.message.text || '').trim(),
        timestamp: item.timestamp || Date.now(),
        raw: item,
      }];
    }
    if (item.delivery?.mids?.length) {
      return item.delivery.mids.map((mid) => ({
        provider, eventId: stableEventId([provider, 'delivered', mid, item.delivery.watermark]),
        eventType: 'delivered', externalAccountId: accountId, providerMessageId: mid, raw: item,
      }));
    }
    if (item.read) {
      return [{
        provider, eventId: stableEventId([provider, 'read', accountId, item.sender?.id, item.read.watermark]),
        eventType: 'read', externalAccountId: accountId, watermark: item.read.watermark, raw: item,
      }];
    }
    return [];
  });
}

function changeEvents(object, entry) {
  const provider = object === 'instagram' ? 'instagram' : 'messenger';
  return (entry.changes || []).flatMap((change) => {
    if (!['feed', 'comments'].includes(change.field)) return [];
    const value = change.value || {};
    const text = String(value.message || value.text || '').trim();
    const senderId = String(value.from?.id || value.sender_id || '');
    const eventId = value.comment_id || value.id || stableEventId([provider, entry.id, senderId, text, value.created_time]);
    return [{
      provider,
      eventId,
      eventType: 'comment',
      externalAccountId: String(entry.id || value.recipient_id || ''),
      senderId,
      senderName: value.from?.name || null,
      text,
      commentId: value.comment_id || value.id || null,
      postId: value.post_id || null,
      timestamp: value.created_time || entry.time || Date.now(),
      raw: change,
    }];
  });
}

function whatsappEvents(entry) {
  return (entry.changes || []).flatMap((change) => {
    if (change.field !== 'messages') return [];
    const value = change.value || {};
    const externalAccountId = String(value.metadata?.phone_number_id || '');
    const messages = (value.messages || []).map((message) => ({
      provider: 'whatsapp',
      eventId: message.id || stableEventId(['whatsapp', externalAccountId, message.from, message.timestamp]),
      eventType: 'message',
      externalAccountId,
      senderId: String(message.from || ''),
      senderName: value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name || null,
      recipientId: externalAccountId,
      text: String(message.text?.body || '').trim(),
      timestamp: Number(message.timestamp || 0) * 1000 || Date.now(),
      raw: message,
    }));
    const statuses = (value.statuses || []).filter((status) => ['delivered', 'read'].includes(status.status)).map((status) => ({
      provider: 'whatsapp',
      eventId: stableEventId(['whatsapp', status.status, status.id, status.timestamp]),
      eventType: status.status,
      externalAccountId,
      providerMessageId: status.id,
      timestamp: Number(status.timestamp || 0) * 1000 || Date.now(),
      raw: status,
    }));
    return [...messages, ...statuses];
  });
}

export function normalizeMetaPayload(payload) {
  if (!payload || !['page', 'instagram', 'whatsapp_business_account'].includes(payload.object)) return [];
  if (payload.object === 'whatsapp_business_account') {
    return (payload.entry || []).flatMap(whatsappEvents)
      .filter((event) => event.externalAccountId && event.eventId);
  }
  return (payload.entry || []).flatMap((entry) => [
    ...messagingEvents(payload.object, entry),
    ...changeEvents(payload.object, entry),
  ]).filter((event) => event.externalAccountId && event.eventId);
}
