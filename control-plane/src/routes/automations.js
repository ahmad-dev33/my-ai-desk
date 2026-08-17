import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';

const automationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(''),
  engine: z.enum(['typebot']).default('typebot'),
  engineRef: z.string().trim().max(255).optional().nullable(),
});

const publishSchema = z.object({
  engineRef: z.string().trim().min(1).max(255),
  definitionSnapshot: z.record(z.string(), z.unknown()).default({}),
});

export function automationRoutes(db) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const result = await db.query(
      `SELECT * FROM automation_definitions WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [req.params.tenantId],
    );
    res.json({ data: result.rows });
  });

  router.post('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'automation-editor']);
    const input = automationSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO automation_definitions (tenant_id, name, description, engine, engine_ref, created_by_subject)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.tenantId, input.name, input.description, input.engine, input.engineRef, req.identity.subject],
    );
    res.status(201).json({ data: result.rows[0] });
  });

  router.post('/:automationId/publish', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'automation-editor']);
    const input = publishSchema.parse(req.body);
    const automation = await db.transaction(async (client) => {
      const current = await client.query(
        `SELECT * FROM automation_definitions
         WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.automationId, req.params.tenantId],
      );
      if (!current.rowCount) return null;
      const version = current.rows[0].current_version + 1;
      const updated = await client.query(
        `UPDATE automation_definitions SET status = 'published', engine_ref = $3,
           current_version = $4, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [req.params.automationId, req.params.tenantId, input.engineRef, version],
      );
      await client.query(
        `INSERT INTO automation_versions
         (automation_id, version, engine_ref, definition_snapshot, published_by_subject, published_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [req.params.automationId, version, input.engineRef, input.definitionSnapshot, req.identity.subject],
      );
      return updated.rows[0];
    });
    if (!automation) return res.status(404).json({ error: 'automation_not_found' });
    return res.json({ data: automation });
  });

  return router;
}
