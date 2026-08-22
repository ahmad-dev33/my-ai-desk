import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';

const providers = ['instagram', 'whatsapp', 'messenger', 'telegram', 'email', 'sms', 'api'];

const sensitiveConfigKey = /(access.?token|refresh.?token|app.?secret|client.?secret|password|private.?key|api.?key|verify.?token)/i;

function containsSensitiveConfig(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => sensitiveConfigKey.test(key) || containsSensitiveConfig(child));
}

const channelConfigSchema = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  if (containsSensitiveConfig(value)) {
    context.addIssue({ code: 'custom', message: 'Store channel secrets in credential_ref, never in config' });
  }
});

export const channelSchema = z.object({
  provider: z.enum(providers),
  externalAccountId: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(200),
  status: z.enum(['pending', 'active', 'error', 'disabled']).default('pending'),
  credentialRef: z.string().trim().min(1).max(255).optional().nullable(),
  chatwootAccountId: z.number().int().positive().optional().nullable(),
  chatwootInboxId: z.number().int().positive().optional().nullable(),
  automationId: z.string().uuid().optional().nullable(),
  config: channelConfigSchema.default({}),
});

const updateChannelSchema = channelSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

function values(input) {
  return [input.provider, input.externalAccountId, input.displayName, input.status, input.credentialRef,
    input.chatwootAccountId, input.chatwootInboxId, input.automationId, input.config];
}

async function bindChatwootAccount(client, tenantId, accountId) {
  if (!accountId) return;
  const inserted = await client.query(
    `INSERT INTO tenant_chatwoot_accounts (tenant_id, chatwoot_account_id)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO NOTHING
     RETURNING chatwoot_account_id`,
    [tenantId, accountId],
  );
  if (inserted.rowCount) return;
  const current = await client.query(
    'SELECT chatwoot_account_id FROM tenant_chatwoot_accounts WHERE tenant_id = $1',
    [tenantId],
  );
  if (Number(current.rows[0]?.chatwoot_account_id) !== Number(accountId)) {
    const error = new Error('Chatwoot account rebinding requires an explicit migration');
    error.code = 'chatwoot_account_rebind_denied';
    error.statusCode = 409;
    throw error;
  }
}

export function channelRoutes(db) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const result = await db.query(
      `SELECT cc.*, ad.name AS automation_name, ad.status AS automation_status, ad.engine_ref
       FROM channel_connections cc
       LEFT JOIN automation_definitions ad ON ad.id = cc.automation_id
       WHERE cc.tenant_id = $1 ORDER BY cc.updated_at DESC`,
      [req.params.tenantId],
    );
    res.json({ data: result.rows });
  });

  router.post('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin']);
    const input = channelSchema.parse(req.body);
    const channel = await db.transaction(async (client) => {
      await bindChatwootAccount(client, req.params.tenantId, input.chatwootAccountId);
      const result = await client.query(
        `INSERT INTO channel_connections
         (tenant_id, provider, external_account_id, display_name, status, credential_ref,
          chatwoot_account_id, chatwoot_inbox_id, automation_id, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [req.params.tenantId, ...values(input)],
      );
      return result.rows[0];
    });
    res.status(201).json({ data: channel });
  });

  router.patch('/:connectionId', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin']);
    const input = updateChannelSchema.parse(req.body);
    const current = await db.query(
      'SELECT * FROM channel_connections WHERE id = $1 AND tenant_id = $2',
      [req.params.connectionId, req.params.tenantId],
    );
    if (!current.rowCount) return res.status(404).json({ error: 'channel_connection_not_found' });
    const row = current.rows[0];
    const merged = {
      provider: input.provider ?? row.provider,
      externalAccountId: input.externalAccountId ?? row.external_account_id,
      displayName: input.displayName ?? row.display_name,
      status: input.status ?? row.status,
      credentialRef: input.credentialRef !== undefined ? input.credentialRef : row.credential_ref,
      chatwootAccountId: input.chatwootAccountId !== undefined ? input.chatwootAccountId : Number(row.chatwoot_account_id),
      chatwootInboxId: input.chatwootInboxId !== undefined ? input.chatwootInboxId : Number(row.chatwoot_inbox_id),
      automationId: input.automationId !== undefined ? input.automationId : row.automation_id,
      config: input.config ?? row.config,
    };
    if (row.chatwoot_account_id === null && input.chatwootAccountId === undefined) merged.chatwootAccountId = null;
    if (row.chatwoot_inbox_id === null && input.chatwootInboxId === undefined) merged.chatwootInboxId = null;
    const channel = await db.transaction(async (client) => {
      await bindChatwootAccount(client, req.params.tenantId, merged.chatwootAccountId);
      const result = await client.query(
        `UPDATE channel_connections SET provider = $3, external_account_id = $4, display_name = $5,
           status = $6, credential_ref = $7, chatwoot_account_id = $8, chatwoot_inbox_id = $9,
           automation_id = $10, config = $11, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [req.params.connectionId, req.params.tenantId, ...values(merged)],
      );
      return result.rows[0];
    });
    return res.json({ data: channel });
  });

  return router;
}
