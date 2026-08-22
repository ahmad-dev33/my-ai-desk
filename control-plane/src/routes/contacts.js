import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';
import { pagination } from '../validation.js';
import { syncContactFromChatwoot, syncContactToChatwoot } from '../crm/contact-sync.js';

const contactSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  customFields: z.record(z.string(), z.unknown()).default({}),
  identity: z.object({
    provider: z.enum(['instagram', 'whatsapp', 'messenger', 'telegram', 'email', 'sms', 'api', 'chatwoot']),
    externalId: z.string().trim().min(1).max(255),
    username: z.string().trim().max(255).optional().nullable(),
  }).optional(),
});

export function contactRoutes(db, config) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const { limit, offset } = pagination(req.query);
    const search = String(req.query.search ?? '').trim();
    const result = await db.query(
      `SELECT c.*,
        COALESCE(json_agg(ci ORDER BY ci.created_at) FILTER (WHERE ci.id IS NOT NULL), '[]') AS identities
       FROM contact_profiles c
       LEFT JOIN contact_identities ci ON ci.contact_id = c.id
       WHERE c.tenant_id = $1
         AND ($2 = '' OR c.display_name ILIKE '%' || $2 || '%' OR c.email ILIKE '%' || $2 || '%' OR c.phone ILIKE '%' || $2 || '%')
       GROUP BY c.id ORDER BY c.updated_at DESC LIMIT $3 OFFSET $4`,
      [req.params.tenantId, search, limit, offset],
    );
    res.json({ data: result.rows, pagination: { limit, offset } });
  });

  router.post('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator']);
    const input = contactSchema.parse(req.body);
    const contact = await db.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO contact_profiles (tenant_id, display_name, email, phone, custom_fields)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.params.tenantId, input.displayName, input.email, input.phone, input.customFields],
      );
      if (input.identity) {
        await client.query(
          `INSERT INTO contact_identities (tenant_id, contact_id, provider, external_id, username)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.tenantId, result.rows[0].id, input.identity.provider, input.identity.externalId, input.identity.username],
        );
      }
      return result.rows[0];
    });
    res.status(201).json({ data: contact });
  });

  // Inbound sync endpoint from Chatwoot contact payload
  router.post('/sync/chatwoot', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator']);
    const contact = await syncContactFromChatwoot(db, req.params.tenantId, req.body);
    res.json({ data: contact });
  });

  // Outbound sync endpoint to push CRM updates to Chatwoot Contact API
  router.post('/:contactId/sync/outbound', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin']);
    const connection = await db.query(
      `SELECT chatwoot_account_id, credential_ref
       FROM channel_connections
       WHERE tenant_id = $1 AND status = 'active'
         AND chatwoot_account_id IS NOT NULL AND credential_ref IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [req.params.tenantId],
    );
    if (!connection.rowCount) {
      return res.status(409).json({ error: 'chatwoot_connection_not_configured' });
    }
    let credentials = {};
    try { credentials = JSON.parse(config.BRIDGE_CREDENTIALS_JSON || '{}'); } catch { return res.status(500).json({ error: 'invalid_bridge_credentials_config' }); }
    const row = connection.rows[0];
    const syncResult = await syncContactToChatwoot(db, req.params.tenantId, req.params.contactId, {
      chatwootApiUrl: config.CHATWOOT_BASE_URL,
      chatwootApiToken: credentials[row.credential_ref] || config.CHATWOOT_API_TOKEN,
      chatwootAccountId: row.chatwoot_account_id,
    });
    res.json({ data: syncResult });
  });

  return router;
}
