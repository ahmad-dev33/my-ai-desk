import crypto from 'node:crypto';

function stableEventId(parts) {
  return crypto.createHash('sha256').update(parts.filter((part) => part !== undefined && part !== null && part !== '').join(':')).digest('hex');
}

function baseEvent(provider, entry, item, eventType, discriminator = '') {
  const externalAccountId = String(entry.id || item.recipient?.id || item.recipient_id || '');
  const senderId = String(item.sender?.id || item.from?.id || item.sender_id || item.user_id || '');
  const timestamp = item.timestamp || item.created_time || entry.time || Date.now();
  return {
    provider,
    eventId: stableEventId([provider, eventType, externalAccountId, senderId, discriminator, timestamp]),
    eventType,
    externalAccountId,
    senderId,
    senderName: item.sender_name || item.sender?.name || item.from?.name || null,
    recipientId: String(item.recipient?.id || item.recipient_id || externalAccountId),
    timestamp,
    raw: item,
  };
}

function normalizeMessagingItem(provider, entry, item, standby = false) {
    const accountId = String(entry.id || item.recipient?.id || '');
    if (item.message) {
      const eventType = standby ? 'standby_message' : item.message.is_echo ? 'outbound_message' : 'message';
      const event = baseEvent(provider, entry, item, eventType, item.message.mid || item.message.text);
      event.eventId = standby ? stableEventId([provider, eventType, item.message.mid, item.timestamp]) : item.message.mid || event.eventId;
      event.providerMessageId = item.message.mid || null;
      event.text = String(item.message.text || '').trim();
      event.attachments = item.message.attachments || [];
      if (item.message.is_echo) {
        event.senderId = String(item.recipient?.id || '');
        event.senderName = item.recipient_name || null;
        event.recipientId = String(item.sender?.id || accountId);
      }
      return [event];
    }
    if (item.postback) {
      const eventType = standby ? 'standby_postback' : 'postback';
      const event = baseEvent(provider, entry, item, eventType, item.postback.mid || item.postback.payload);
      event.providerMessageId = item.postback.mid || null;
      event.text = String(item.postback.title || item.postback.payload || '').trim();
      event.postbackPayload = item.postback.payload || null;
      return [event];
    }
    if (item.delivery?.mids?.length) {
      return item.delivery.mids.map((mid) => ({
        provider, eventId: stableEventId([provider, 'delivered', mid, item.delivery.watermark]),
        eventType: 'delivered', externalAccountId: accountId, providerMessageId: mid, raw: item,
      }));
    }
    if (item.read) {
      return [{
        ...baseEvent(provider, entry, item, 'read', item.read.mid || item.read.watermark),
        providerMessageId: item.read.mid || null,
        watermark: item.read.watermark,
      }];
    }
    if (item.reaction) {
      const event = baseEvent(provider, entry, item, 'message_reaction', item.reaction.mid || item.reaction.reaction);
      event.providerMessageId = item.reaction.mid || null;
      event.reaction = item.reaction.reaction || item.reaction.emoji || null;
      event.reactionAction = item.reaction.action || null;
      return [event];
    }
    if (item.referral) {
      const event = baseEvent(provider, entry, item, 'messaging_referral', item.referral.ref || item.referral.ad_id);
      event.referral = item.referral;
      return [event];
    }
    if (item.optin) {
      const event = baseEvent(provider, entry, item, 'messaging_optin', item.optin.ref || item.optin.user_ref);
      event.optin = item.optin;
      return [event];
    }
    const controlEvent = item.pass_thread_control ? ['pass_thread_control', item.pass_thread_control]
      : item.take_thread_control ? ['take_thread_control', item.take_thread_control]
        : item.request_thread_control ? ['request_thread_control', item.request_thread_control]
          : null;
    if (controlEvent) {
      const event = baseEvent(provider, entry, item, controlEvent[0], controlEvent[1].metadata || controlEvent[1].new_owner_app_id);
      event.control = controlEvent[1];
      return [event];
    }
    return [];
}

function messagingEvents(object, entry) {
  const provider = object === 'instagram' ? 'instagram' : 'messenger';
  return [
    ...(entry.messaging || []).flatMap((item) => normalizeMessagingItem(provider, entry, item, false)),
    ...(entry.standby || []).flatMap((item) => normalizeMessagingItem(provider, entry, item, true)),
  ];
}

const changeEventTypes = Object.freeze({
  feed: 'comment',
  comments: 'comment',
  live_comments: 'live_comment',
  message_edit: 'message_edit',
  message_reactions: 'message_reaction',
  messaging_referral: 'messaging_referral',
  messaging_optins: 'messaging_optin',
  messaging_handover: 'messaging_handover',
  messaging_seen: 'read',
  standby: 'standby_event',
});

function changeEvents(object, entry) {
  const provider = object === 'instagram' ? 'instagram' : 'messenger';
  return (entry.changes || []).flatMap((change) => {
    const eventType = changeEventTypes[change.field];
    if (!eventType) return [];
    const value = change.value || {};
    const discriminator = value.message_id || value.mid || value.comment_id || value.id || value.ref || value.reaction;
    const event = baseEvent(provider, entry, value, eventType, discriminator);
    event.raw = change;
    event.text = String(value.message?.text || value.message || value.text || '').trim();
    event.commentId = value.comment_id || (['comment', 'live_comment'].includes(eventType) ? value.id : null);
    event.postId = value.post_id || value.media?.id || null;
    event.providerMessageId = value.message_id || value.mid || null;
    event.reaction = value.reaction || value.emoji || null;
    event.reactionAction = value.action || null;
    event.referral = eventType === 'messaging_referral' ? value : null;
    event.optin = eventType === 'messaging_optin' ? value : null;
    event.control = ['messaging_handover', 'standby_event'].includes(eventType) ? value : null;
    return [event];
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
