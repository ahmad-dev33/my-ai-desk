import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';
import { pagination } from '../validation.js';

export const knowledgeDocumentSchema = z.object({
  title: z.string().trim().min(1).max(240),
  sourceKind: z.enum(['text', 'url', 'file', 'catalog', 'faq']).default('text'),
  sourceUri: z.string().trim().max(2000).optional().nullable(),
  content: z.string().max(500000).default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((value, ctx) => {
  if (value.sourceKind === 'url' && !value.sourceUri) {
    ctx.addIssue({ code: 'custom', path: ['sourceUri'], message: 'sourceUri is required for URL sources' });
  }
  if (['text', 'faq', 'url'].includes(value.sourceKind) && !value.content.trim()) {
    ctx.addIssue({ code: 'custom', path: ['content'], message: 'content is required until automatic URL extraction is enabled' });
  }
});

export function knowledgeRoutes(db) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const { limit, offset } = pagination(req.query);
    const result = await db.query(
      `SELECT id, tenant_id, title, source_kind, source_uri, status, checksum, metadata,
              error_message, created_at, updated_at
       FROM knowledge_documents WHERE tenant_id = $1
       ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
      [req.params.tenantId, limit, offset],
    );
    res.json({ data: result.rows, pagination: { limit, offset } });
  });

  router.post('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator', 'knowledge-editor']);
    const input = knowledgeDocumentSchema.parse(req.body);
    const checksum = createHash('sha256').update(input.content).digest('hex');
    const result = await db.query(
      `INSERT INTO knowledge_documents
       (tenant_id, title, source_kind, source_uri, content, status, checksum, metadata)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7) RETURNING *`,
      [req.params.tenantId, input.title, input.sourceKind, input.sourceUri, input.content, checksum, input.metadata],
    );
    res.status(201).json({ data: result.rows[0] });
  });

  router.get('/:documentId', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const result = await db.query(
      'SELECT * FROM knowledge_documents WHERE id = $1 AND tenant_id = $2',
      [req.params.documentId, req.params.tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'knowledge_document_not_found' });
    return res.json({ data: result.rows[0] });
  });

  router.delete('/:documentId', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator', 'knowledge-editor']);
    const result = await db.query(
      `UPDATE knowledge_documents SET status = 'archived', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.documentId, req.params.tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'knowledge_document_not_found' });
    return res.status(204).end();
  });

  return router;
}
