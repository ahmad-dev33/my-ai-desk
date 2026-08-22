import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';
import { pagination } from '../validation.js';
import {
  dispatchBroadcast,
  evaluateKeywords,
  getCampaignAnalyticsLedger,
  processStoryReplyOrComment,
  subscribeContactToDrip,
} from '../manychat/parity-engine.js';

const keywordRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  keyword: z.string().trim().min(1).max(200),
  matchType: z.enum(['exact', 'contains', 'starts_with', 'regex']).default('contains'),
  channelProvider: z.string().trim().default('all'),
  actionType: z.enum(['trigger_automation', 'send_reply', 'add_tag', 'handoff_human', 'ai_rag_query']).default('trigger_automation'),
  actionPayload: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().int().default(10),
  status: z.enum(['active', 'paused']).default('active'),
});

const dripSequenceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().default(''),
  status: z.enum(['draft', 'active', 'paused', 'archived']).default('active'),
  steps: z.array(z.object({
    step: z.number().int().min(0),
    delayMinutes: z.number().int().min(0),
    messageText: z.string().trim().min(1),
    automationId: z.string().optional(),
  })).default([]),
});

const broadcastSchema = z.object({
  name: z.string().trim().min(1).max(200),
  targetFilter: z.record(z.string(), z.unknown()).default({}),
  content: z.record(z.string(), z.unknown()).default({}),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export function manychatRoutes(db) {
  const router = Router({ mergeParams: true });

  // 1. Keywords Management
  router.get('/keywords', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const { limit, offset } = pagination(req.query);
    const result = await db.query(
      `SELECT * FROM keyword_rules
       WHERE tenant_id = $1
       ORDER BY priority DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.tenantId, limit, offset],
    );
    res.json({ data: result.rows, pagination: { limit, offset } });
  });

  router.post('/keywords', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator']);
    const input = keywordRuleSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO keyword_rules
       (tenant_id, name, keyword, match_type, channel_provider, action_type, action_payload, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.params.tenantId,
        input.name,
        input.keyword,
        input.matchType,
        input.channelProvider,
        input.actionType,
        input.actionPayload,
        input.priority,
        input.status,
      ],
    );
    res.status(201).json({ data: result.rows[0] });
  });

  router.delete('/keywords/:ruleId', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator']);
    const result = await db.query(
      'DELETE FROM keyword_rules WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.ruleId, req.params.tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'keyword_rule_not_found' });
    return res.status(204).end();
  });

  // Evaluate message against keywords test
  router.post('/keywords/test', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const match = await evaluateKeywords(db, req.params.tenantId, req.body.text, req.body.provider || 'all');
    res.json({ data: match });
  });

  // 2. Drip Sequences
  router.get('/sequences', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const result = await db.query(
      'SELECT * FROM drip_sequences WHERE tenant_id = $1 ORDER BY updated_at DESC',
      [req.params.tenantId],
    );
    res.json({ data: result.rows });
  });

  router.post('/sequences', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator']);
    const input = dripSequenceSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO drip_sequences (tenant_id, name, description, status, steps)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.tenantId, input.name, input.description, input.status, JSON.stringify(input.steps)],
    );
    res.status(201).json({ data: result.rows[0] });
  });

  router.post('/sequences/:sequenceId/subscribe', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator']);
    const subscription = await subscribeContactToDrip(db, req.params.tenantId, req.params.sequenceId, req.body.contactId);
    res.json({ data: subscription });
  });

  // 3. Broadcast Campaigns
  router.get('/broadcasts', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const result = await db.query(
      'SELECT * FROM broadcast_campaigns WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.params.tenantId],
    );
    res.json({ data: result.rows });
  });

  router.post('/broadcasts', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator']);
    const input = broadcastSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO broadcast_campaigns (tenant_id, name, target_filter, content, scheduled_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.tenantId, input.name, input.targetFilter, input.content, input.scheduledAt || null],
    );
    res.status(201).json({ data: result.rows[0] });
  });

  router.post('/broadcasts/:campaignId/dispatch', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator']);
    const dispatchResult = await dispatchBroadcast(db, req.params.tenantId, req.params.campaignId);
    res.json({ data: dispatchResult });
  });

  // 4. Story Reply & Comment Hook
  router.post('/story-hook', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const hookResult = await processStoryReplyOrComment(db, req.params.tenantId, req.body);
    res.json({ data: hookResult });
  });

  // 5. Campaign Analytics Ledger
  router.get('/analytics', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const analytics = await getCampaignAnalyticsLedger(db, req.params.tenantId);
    res.json({ data: analytics });
  });

  return router;
}
