import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requirePlatformAdmin } from '../auth.js';
import { upsertOperator } from '../access.js';
import { slugify } from '../validation.js';

const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(63).optional(),
  locale: z.string().trim().min(2).max(10).default('ar'),
  timezone: z.string().trim().min(1).max(64).default('Asia/Damascus'),
});

export function tenantRoutes(db) {
  const router = Router();

  router.get('/', async (req, res) => {
    await upsertOperator(db, req.identity);
    const isAdmin = req.identity.roles.includes('platform-admin');
    const result = await db.query(
      isAdmin
        ? `SELECT t.*, ARRAY[]::text[] AS roles FROM tenants t ORDER BY t.created_at DESC`
        : `SELECT t.*, m.roles FROM tenants t
           JOIN memberships m ON m.tenant_id = t.id
           JOIN operators o ON o.id = m.operator_id
           WHERE o.oidc_subject = $1 ORDER BY t.created_at DESC`,
      isAdmin ? [] : [req.identity.subject],
    );
    res.json({ data: result.rows });
  });

  router.post('/', requirePlatformAdmin, async (req, res) => {
    const input = createTenantSchema.parse(req.body);
    const slug = slugify(input.slug ?? input.name) || `tenant-${randomUUID().slice(0, 8)}`;

    const tenant = await db.transaction(async (client) => {
      const operatorResult = await client.query(
        `INSERT INTO operators (oidc_subject, email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (oidc_subject) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
         RETURNING id`,
        [req.identity.subject, req.identity.email, req.identity.name ?? req.identity.email],
      );
      const tenantResult = await client.query(
        `INSERT INTO tenants (name, slug, locale, timezone)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.name, slug, input.locale, input.timezone],
      );
      await client.query(
        `INSERT INTO memberships (tenant_id, operator_id, roles) VALUES ($1, $2, $3)`,
        [tenantResult.rows[0].id, operatorResult.rows[0].id, ['tenant-admin']],
      );
      return tenantResult.rows[0];
    });
    res.status(201).json({ data: tenant });
  });

  return router;
}
