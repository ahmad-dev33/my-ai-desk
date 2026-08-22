import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';

const chatwootSessionSchema = z.object({ tenantId: z.string().uuid() });

function unavailable() {
  const error = new Error('Chatwoot Platform API is not configured');
  error.code = 'chatwoot_sso_not_configured';
  error.statusCode = 503;
  return error;
}

export function sessionRoutes(db, chatwootPlatform) {
  const router = Router();

  router.post('/chatwoot', async (req, res) => {
    if (!chatwootPlatform) throw unavailable();
    const input = chatwootSessionSchema.parse(req.body);
    await assertTenantAccess(db, req.identity, input.tenantId);
    const accounts = await db.query(
      `SELECT chatwoot_account_id FROM tenant_chatwoot_accounts WHERE tenant_id = $1`,
      [input.tenantId],
    );
    if (!accounts.rowCount) return res.status(409).json({ error: 'tenant_chatwoot_account_not_configured' });
    const user = await chatwootPlatform.ensureUserAccount({
      email: req.identity.email,
      name: req.identity.name ?? req.identity.email,
      accountId: Number(accounts.rows[0].chatwoot_account_id),
      role: req.identity.roles.includes('platform-admin') ? 'administrator' : 'agent',
    });
    await db.query(
      `UPDATE operators SET chatwoot_user_id = $2, updated_at = now() WHERE oidc_subject = $1`,
      [req.identity.subject, user.id],
    );
    const url = await chatwootPlatform.createSession({
      userId: user.id,
      accountId: Number(accounts.rows[0].chatwoot_account_id),
    });
    res.header('Cache-Control', 'no-store');
    return res.json({ data: { url } });
  });

  return router;
}
