import { Router } from 'express';
import { z } from 'zod';
import { requirePlatformAdmin } from '../auth.js';

const employeeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(2).max(160),
  temporaryPassword: z.string().min(12).max(128),
});

const statusSchema = z.object({ status: z.enum(['active', 'suspended']) });
const membershipSchema = z.object({
  roles: z.array(z.enum(['tenant-admin', 'operator', 'automation-editor'])).min(1).max(3)
    .transform((roles) => [...new Set(roles)]),
});

function unavailable() {
  const error = new Error('Identity provider administration is not configured');
  error.code = 'identity_provider_not_configured';
  error.statusCode = 503;
  return error;
}

function chatwootUnavailable() {
  const error = new Error('Chatwoot Platform API is not configured');
  error.code = 'chatwoot_platform_not_configured';
  error.statusCode = 503;
  return error;
}

export function operatorRoutes(db, identityProvider, chatwootPlatform = null) {
  const router = Router();
  router.use(requirePlatformAdmin);

  router.get('/', async (_req, res) => {
    const result = await db.query(
      `SELECT o.id, o.oidc_subject, o.email, o.display_name, o.status,
              o.created_at, o.updated_at,
              COALESCE(json_agg(json_build_object(
                'tenantId', t.id, 'tenantName', t.name, 'roles', m.roles
              ) ORDER BY t.name) FILTER (WHERE t.id IS NOT NULL), '[]'::json) AS memberships
       FROM operators o
       LEFT JOIN memberships m ON m.operator_id = o.id
       LEFT JOIN tenants t ON t.id = m.tenant_id
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
    );
    res.json({ data: result.rows });
  });

  router.post('/', async (req, res) => {
    if (!identityProvider) throw unavailable();
    const input = employeeSchema.parse(req.body);
    const identity = await identityProvider.createEmployee(input);
    try {
      const result = await db.query(
        `INSERT INTO operators (oidc_subject, email, display_name, status, created_by_subject)
         VALUES ($1, $2, $3, 'active', $4) RETURNING *`,
        [identity.subject, input.email, input.displayName, req.identity.subject],
      );
      await db.query(
        `INSERT INTO audit_logs (actor_subject, action, resource_type, resource_id, metadata)
         VALUES ($1, 'employee.created', 'operator', $2, $3)`,
        [req.identity.subject, result.rows[0].id, { email: input.email }],
      );
      return res.status(201).json({ data: result.rows[0] });
    } catch (error) {
      await identityProvider.deleteEmployee(identity.subject).catch(() => {});
      throw error;
    }
  });

  router.patch('/:operatorId', async (req, res) => {
    if (!identityProvider) throw unavailable();
    const input = statusSchema.parse(req.body);
    const current = await db.query(
      'SELECT * FROM operators WHERE id = $1',
      [req.params.operatorId],
    );
    if (!current.rowCount) return res.status(404).json({ error: 'operator_not_found' });
    if (current.rows[0].oidc_subject === req.identity.subject) {
      return res.status(409).json({ error: 'cannot_change_own_operator_status' });
    }
    if (input.status === 'suspended' && current.rows[0].chatwoot_user_id) {
      const accounts = await db.query(
        `SELECT tca.chatwoot_account_id
         FROM memberships m
         JOIN tenant_chatwoot_accounts tca ON tca.tenant_id = m.tenant_id
         WHERE m.operator_id = $1`,
        [req.params.operatorId],
      );
      if (accounts.rowCount && !chatwootPlatform) throw chatwootUnavailable();
      for (const account of accounts.rows) {
        await chatwootPlatform.removeUserAccount({
          userId: current.rows[0].chatwoot_user_id,
          accountId: Number(account.chatwoot_account_id),
        });
      }
    }
    await identityProvider.setEmployeeEnabled(current.rows[0].oidc_subject, input.status === 'active');
    try {
      const result = await db.transaction(async (client) => {
        const updated = await client.query(
          'UPDATE operators SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
          [req.params.operatorId, input.status],
        );
        await client.query(
          `INSERT INTO audit_logs (actor_subject, action, resource_type, resource_id, metadata)
           VALUES ($1, $2, 'operator', $3, $4)`,
          [req.identity.subject, `employee.${input.status}`, req.params.operatorId, { previousStatus: current.rows[0].status }],
        );
        return updated.rows[0];
      });
      return res.json({ data: result });
    } catch (error) {
      await identityProvider.setEmployeeEnabled(
        current.rows[0].oidc_subject,
        current.rows[0].status === 'active',
      ).catch(() => {});
      throw error;
    }
  });

  router.put('/:operatorId/memberships/:tenantId', async (req, res) => {
    const input = membershipSchema.parse(req.body);
    const result = await db.transaction(async (client) => {
      const operator = await client.query('SELECT id FROM operators WHERE id = $1', [req.params.operatorId]);
      if (!operator.rowCount) return null;
      const tenant = await client.query('SELECT id FROM tenants WHERE id = $1', [req.params.tenantId]);
      if (!tenant.rowCount) return undefined;
      const membership = await client.query(
        `INSERT INTO memberships (tenant_id, operator_id, roles)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, operator_id) DO UPDATE SET roles = EXCLUDED.roles
         RETURNING *`,
        [req.params.tenantId, req.params.operatorId, input.roles],
      );
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_subject, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, 'membership.upserted', 'operator', $3, $4)`,
        [req.params.tenantId, req.identity.subject, req.params.operatorId, { roles: input.roles }],
      );
      return membership.rows[0];
    });
    if (result === null) return res.status(404).json({ error: 'operator_not_found' });
    if (result === undefined) return res.status(404).json({ error: 'tenant_not_found' });
    const access = await db.query(
      `SELECT o.email, o.display_name, tca.chatwoot_account_id
       FROM operators o
       LEFT JOIN tenant_chatwoot_accounts tca ON tca.tenant_id = $2
       WHERE o.id = $1`,
      [req.params.operatorId, req.params.tenantId],
    );
    if (access.rows[0]?.chatwoot_account_id) {
      if (!chatwootPlatform) throw chatwootUnavailable();
      const user = await chatwootPlatform.ensureUserAccount({
        email: access.rows[0].email,
        name: access.rows[0].display_name,
        accountId: Number(access.rows[0].chatwoot_account_id),
        role: 'agent',
      });
      await db.query(
        'UPDATE operators SET chatwoot_user_id = $2, updated_at = now() WHERE id = $1',
        [req.params.operatorId, user.id],
      );
    }
    return res.json({ data: result });
  });

  router.delete('/:operatorId/memberships/:tenantId', async (req, res) => {
    const access = await db.query(
      `SELECT o.chatwoot_user_id, tca.chatwoot_account_id
       FROM operators o
       LEFT JOIN tenant_chatwoot_accounts tca ON tca.tenant_id = $2
       WHERE o.id = $1`,
      [req.params.operatorId, req.params.tenantId],
    );
    if (access.rows[0]?.chatwoot_user_id && access.rows[0]?.chatwoot_account_id) {
      if (!chatwootPlatform) throw chatwootUnavailable();
      await chatwootPlatform.removeUserAccount({
        userId: access.rows[0].chatwoot_user_id,
        accountId: Number(access.rows[0].chatwoot_account_id),
      });
    }
    const result = await db.transaction(async (client) => {
      const deleted = await client.query(
        'DELETE FROM memberships WHERE tenant_id = $1 AND operator_id = $2 RETURNING *',
        [req.params.tenantId, req.params.operatorId],
      );
      if (!deleted.rowCount) return false;
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_subject, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, 'membership.removed', 'operator', $3, $4)`,
        [req.params.tenantId, req.identity.subject, req.params.operatorId, { roles: deleted.rows[0].roles }],
      );
      return true;
    });
    if (!result) return res.status(404).json({ error: 'membership_not_found' });
    return res.status(204).end();
  });

  return router;
}
