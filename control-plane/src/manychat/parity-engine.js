/**
 * Isolated ManyChat Parity Engine Module
 * 
 * Provides ManyChat replacement capabilities: keyword triggers, story replies,
 * comment-to-DM hooks, automated drip sequences, broadcast campaigns,
 * and unified analytics ledger.
 */

/**
 * Evaluates an incoming text message against tenant keyword rules.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {string} messageText
 * @param {string} [channelProvider='all']
 * @returns {Promise<Object|null>} Matched keyword rule or null
 */
export async function evaluateKeywords(db, tenantId, messageText, channelProvider = 'all') {
  const text = (messageText || '').trim();
  if (!text) return null;

  const rulesRes = await db.query(
    `SELECT * FROM keyword_rules
     WHERE tenant_id = $1 AND status = 'active'
       AND (channel_provider = 'all' OR channel_provider = $2)
     ORDER BY priority DESC, created_at ASC`,
    [tenantId, channelProvider],
  );

  for (const rule of rulesRes.rows) {
    const kw = (rule.keyword || '').trim();
    let isMatch = false;

    switch (rule.match_type) {
      case 'exact':
        isMatch = text.toLowerCase() === kw.toLowerCase();
        break;
      case 'starts_with':
        isMatch = text.toLowerCase().startsWith(kw.toLowerCase());
        break;
      case 'regex':
        try {
          const regex = new RegExp(kw, 'i');
          isMatch = regex.test(text);
        } catch {
          isMatch = false;
        }
        break;
      case 'contains':
      default:
        isMatch = text.toLowerCase().includes(kw.toLowerCase());
        break;
    }

    if (isMatch) {
      // Record analytics trigger event
      await recordCampaignEvent(db, tenantId, 'keyword', rule.id, 'triggered', null, {
        keyword: rule.keyword,
        matchedText: text,
      });

      return rule;
    }
  }

  return null;
}

/**
 * Processes Instagram story reply or comment-to-DM triggers.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {Object} payload - Story or comment webhook payload
 * @returns {Promise<{ action: string, automationId?: string, replyText?: string }>}
 */
export async function processStoryReplyOrComment(db, tenantId, payload) {
  const isStoryReply = Boolean(payload.story_id || payload.is_story_reply);
  const isComment = Boolean(payload.comment_id || payload.is_comment);
  const text = payload.text || payload.comment_text || '';

  // Check keyword rules specifically for story or comment triggers
  const rule = await evaluateKeywords(db, tenantId, text, 'instagram');

  if (rule) {
    return {
      action: rule.action_type,
      payload: rule.action_payload,
      ruleId: rule.id,
      isStoryReply,
      isComment,
    };
  }

  // Fallback default response for story reply or comment-to-DM
  return {
    action: 'default_dm_hook',
    replyText: isStoryReply
      ? 'Thanks for replying to our story! How can we help you today?'
      : 'Thanks for your comment! We sent you a direct message.',
    isStoryReply,
    isComment,
  };
}

/**
 * Subscribes a contact to an automated drip sequence.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {string} sequenceId
 * @param {string} contactId
 * @returns {Promise<Object>} Subscription record
 */
export async function subscribeContactToDrip(db, tenantId, sequenceId, contactId) {
  const seqRes = await db.query(
    'SELECT * FROM drip_sequences WHERE id = $1 AND tenant_id = $2 AND status = \'active\'',
    [sequenceId, tenantId],
  );

  if (!seqRes.rowCount) throw new Error('Active drip sequence not found');

  const steps = seqRes.rows[0].steps || [];
  const firstStepDelayMinutes = steps[0]?.delayMinutes || 0;
  const nextRunAt = new Date(Date.now() + firstStepDelayMinutes * 60 * 1000);

  const result = await db.query(
    `INSERT INTO drip_subscriptions (tenant_id, sequence_id, contact_id, current_step, status, next_run_at)
     VALUES ($1, $2, $3, 0, 'active', $4)
     ON CONFLICT (sequence_id, contact_id) DO UPDATE SET
       status = 'active',
       current_step = 0,
       next_run_at = EXCLUDED.next_run_at,
       updated_at = now()
     RETURNING *`,
    [tenantId, sequenceId, contactId, nextRunAt],
  );

  await recordCampaignEvent(db, tenantId, 'sequence', sequenceId, 'triggered', contactId, {
    step: 0,
    nextRunAt: nextRunAt.toISOString(),
  });

  return result.rows[0];
}

/**
 * Dispatches a broadcast campaign to filtered contacts.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {string} campaignId
 * @returns {Promise<{ campaignId: string, totalRecipients: number, status: string }>}
 */
export async function dispatchBroadcast(db, tenantId, campaignId) {
  const campaignRes = await db.query(
    'SELECT * FROM broadcast_campaigns WHERE id = $1 AND tenant_id = $2',
    [campaignId, tenantId],
  );

  if (!campaignRes.rowCount) throw new Error('Broadcast campaign not found');
  const campaign = campaignRes.rows[0];

  // Delivery is intentionally deferred until the Meta channel adapter and an
  // outbox worker exist. Never report recipients as sent without a provider receipt.
  await db.query(
    `UPDATE broadcast_campaigns SET status = 'scheduled', updated_at = now() WHERE id = $1`,
    [campaignId],
  );
  return { campaignId, totalRecipients: 0, sentCount: 0, status: 'scheduled', deliveryConfigured: false };
}

/**
 * Records an analytics event into campaign_analytics single ledger.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {'broadcast'|'sequence'|'keyword'|'automation'|'ai_rag'} campaignType
 * @param {string} campaignId
 * @param {'triggered'|'sent'|'delivered'|'read'|'clicked'|'replied'|'failed'|'handoff'} eventType
 * @param {string|null} [contactId=null]
 * @param {Object} [metadata={}]
 */
export async function recordCampaignEvent(db, tenantId, campaignType, campaignId, eventType, contactId = null, metadata = {}) {
  await db.query(
    `INSERT INTO campaign_analytics (tenant_id, campaign_type, campaign_id, event_type, contact_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, campaignType, String(campaignId), eventType, contactId, JSON.stringify(metadata)],
  );
}

/**
 * Retrieves aggregate campaign analytics ledger for tenant dashboard.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @returns {Promise<Object>} Aggregate summary statistics and recent events
 */
export async function getCampaignAnalyticsLedger(db, tenantId) {
  const summaryRes = await db.query(
    `SELECT campaign_type, event_type, COUNT(*)::integer AS event_count
     FROM campaign_analytics
     WHERE tenant_id = $1
     GROUP BY campaign_type, event_type
     ORDER BY campaign_type, event_type`,
    [tenantId],
  );

  const recentEventsRes = await db.query(
    `SELECT ca.*, c.display_name AS contact_name
     FROM campaign_analytics ca
     LEFT JOIN contact_profiles c ON c.id = ca.contact_id
     WHERE ca.tenant_id = $1
     ORDER BY ca.occurred_at DESC
     LIMIT 50`,
    [tenantId],
  );

  return {
    summary: summaryRes.rows,
    recentEvents: recentEventsRes.rows,
  };
}
