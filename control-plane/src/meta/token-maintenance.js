import { resolveCredential, saveCredential } from '../credentials/store.js';

async function refreshCredential(db, config, row) {
  const credential = await resolveCredential(db, config, row.credential_ref);
  if (!credential?.accessToken) return;
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', credential.accessToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body.error?.message || 'Instagram token refresh failed');
  const expiresAt = new Date(Date.now() + Number(body.expires_in || 5184000) * 1000);
  await saveCredential(db, config, {
    credentialRef: row.credential_ref,
    provider: 'instagram',
    value: { accessToken: body.access_token, expiresAt: expiresAt.toISOString() },
    metadata: row.metadata || {},
    expiresAt,
  });
}

export async function runMetaMaintenance({ db, config, logger = console }) {
  if (config.META_INSTAGRAM_APP_ID || config.META_APP_ID) {
    const credentials = await db.query(
      `SELECT credential_ref, metadata, expires_at FROM provider_credentials
       WHERE provider = 'instagram'
         AND (expires_at IS NULL OR expires_at < now() + interval '14 days')`,
    );
    for (const row of credentials.rows) {
      await refreshCredential(db, config, row).catch((error) => {
        logger.error?.('Instagram credential refresh failed', { credentialRef: row.credential_ref, error: error.message });
      });
    }
  }
  await db.query(
    `UPDATE provider_webhook_events SET payload = '{}'::jsonb
     WHERE received_at < now() - make_interval(days => $1) AND payload <> '{}'::jsonb`,
    [config.DATA_RETENTION_DAYS],
  );
  await db.query(
    `UPDATE outbound_messages SET content = '{"redacted":true}'::jsonb
     WHERE created_at < now() - make_interval(days => $1) AND content <> '{"redacted":true}'::jsonb`,
    [config.DATA_RETENTION_DAYS],
  );
}

export function createMetaMaintenanceWorker({ db, config, logger = console }) {
  let stopped = false;
  let running = false;
  const execute = async () => {
    if (stopped || running) return;
    running = true;
    try { await runMetaMaintenance({ db, config, logger }); }
    catch (error) { logger.error?.('Meta maintenance failed', { error: error.message }); }
    finally { running = false; }
  };
  const initial = setTimeout(execute, 30000);
  const interval = setInterval(execute, config.META_TOKEN_REFRESH_INTERVAL_MS);
  initial.unref?.();
  interval.unref?.();
  return { stop() { stopped = true; clearTimeout(initial); clearInterval(interval); } };
}
