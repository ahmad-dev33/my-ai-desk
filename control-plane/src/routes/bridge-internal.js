import crypto from 'node:crypto';
import { Router } from 'express';

function secureEqual(left = '', right = '') {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function bridgeInternalRoutes(db, serviceSecret) {
  const router = Router();

  router.use((req, res, next) => {
    if (!serviceSecret || !secureEqual(req.get('x-bridge-token'), serviceSecret)) {
      return res.status(401).json({ error: 'invalid_bridge_token' });
    }
    return next();
  });

  router.get('/routes/chatwoot/:accountId/inboxes/:inboxId', async (req, res) => {
    const result = await db.query(
      `SELECT cc.id AS channel_connection_id, cc.tenant_id, cc.provider,
              cc.credential_ref, cc.chatwoot_account_id, cc.chatwoot_inbox_id,
              ad.id AS automation_id, ad.engine, ad.engine_ref AS typebot_public_id,
              ad.current_version
       FROM channel_connections cc
       JOIN automation_definitions ad ON ad.id = cc.automation_id AND ad.tenant_id = cc.tenant_id
       WHERE cc.chatwoot_account_id = $1
         AND cc.chatwoot_inbox_id = $2
         AND cc.status = 'active'
         AND ad.status = 'published'
       LIMIT 1`,
      [req.params.accountId, req.params.inboxId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'bridge_route_not_found' });
    return res.json({ data: result.rows[0] });
  });

  return router;
}

