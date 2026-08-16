import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';

const automationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(''),
  engine: z.enum(['typebot']).default('typebot'),
  engineRef: z.string().trim().max(255).optional().nullable(),
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

  return router;
}
