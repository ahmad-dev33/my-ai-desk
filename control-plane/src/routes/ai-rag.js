import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';
import { answerTenantQuestion } from '../ai/tenant-answer.js';
import { processDocumentChunks, searchKnowledge } from '../rag/rag-engine.js';

const policySchema = z.object({
  confidenceThreshold: z.number().min(0.0).max(1.0).default(0.75),
  sentimentEscalationEnabled: z.boolean().default(true),
  fallbackReply: z.string().trim().min(1).max(1000).default('I am connecting you with a human representative.'),
  customSystemPrompt: z.string().trim().max(4000).default('You are a helpful customer support AI assistant.'),
  autoHandoffKeywords: z.array(z.string().trim().min(1)).default(['human', 'agent', 'support', 'help', 'انسان', 'دعم']),
  escalationInboxId: z.number().int().positive().optional().nullable(),
});

const searchQuerySchema = z.object({
  query: z.string().trim().min(1).max(1000),
  topK: z.number().int().min(1).max(10).default(3),
});

function serializePolicy(row, tenantId, config) {
  return {
    tenantId,
    confidenceThreshold: Number(row?.confidence_threshold ?? 0.75),
    sentimentEscalationEnabled: row?.sentiment_escalation_enabled ?? true,
    fallbackReply: row?.fallback_reply || 'سأحوّل المحادثة إلى موظف لمساعدتك.',
    customSystemPrompt: row?.custom_system_prompt || 'أنت مساعد خدمة عملاء دقيق. اعتمد فقط على منتجات ومعرفة الشركة المرفقة.',
    autoHandoffKeywords: row?.auto_handoff_keywords || ['human', 'agent', 'support', 'help', 'انسان', 'موظف', 'دعم', 'مساعدة'],
    escalationInboxId: row?.escalation_inbox_id || null,
    provider: {
      configured: Boolean(config?.OPENAI_API_KEY && config.OPENAI_API_KEY !== 'mock'),
      model: config?.OPENAI_MODEL || 'gpt-5-mini',
      fallbackMode: 'deterministic-tenant-context-v1',
    },
  };
}

export function aiRagRoutes(db, config = {}) {
  const router = Router({ mergeParams: true });

  // Get AI Handoff Policy
  router.get('/policy', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const result = await db.query(
      'SELECT * FROM ai_handoff_policies WHERE tenant_id = $1',
      [req.params.tenantId],
    );
    return res.json({ data: serializePolicy(result.rows[0], req.params.tenantId, config) });
  });

  // Update AI Handoff Policy
  router.put('/policy', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator', 'knowledge-editor']);
    const input = policySchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO ai_handoff_policies
       (tenant_id, confidence_threshold, sentiment_escalation_enabled, fallback_reply, custom_system_prompt, auto_handoff_keywords, escalation_inbox_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (tenant_id) DO UPDATE SET
         confidence_threshold = EXCLUDED.confidence_threshold,
         sentiment_escalation_enabled = EXCLUDED.sentiment_escalation_enabled,
         fallback_reply = EXCLUDED.fallback_reply,
         custom_system_prompt = EXCLUDED.custom_system_prompt,
         auto_handoff_keywords = EXCLUDED.auto_handoff_keywords,
         escalation_inbox_id = EXCLUDED.escalation_inbox_id,
         updated_at = now()
       RETURNING *`,
      [
        req.params.tenantId,
        input.confidenceThreshold,
        input.sentimentEscalationEnabled,
        input.fallbackReply,
        input.customSystemPrompt,
        input.autoHandoffKeywords,
        input.escalationInboxId || null,
      ],
    );
    res.json({ data: serializePolicy(result.rows[0], req.params.tenantId, config) });
  });

  // Trigger document chunking and vector embeddings generation
  router.post('/documents/:documentId/chunk', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator', 'knowledge-editor']);
    const result = await processDocumentChunks(db, req.params.tenantId, req.params.documentId);
    res.json({ data: { documentId: req.params.documentId, ...result, status: 'ready' } });
  });

  // Semantic similarity search endpoint
  router.post('/search', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const input = searchQuerySchema.parse(req.body);
    const results = await searchKnowledge(db, req.params.tenantId, input.query, input.topK);
    res.json({ data: results });
  });

  // Complete RAG Query Evaluation & Handoff Pipeline
  router.post('/query', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const input = searchQuerySchema.parse(req.body);

    const result = await answerTenantQuestion({
      db,
      config,
      tenantId: req.params.tenantId,
      question: input.query,
    });
    return res.json({ data: result });
  });

  return router;
}
