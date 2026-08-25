import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';
import { deleteCredential, resolveCredential, saveCredential } from '../credentials/store.js';
import { syncInstagramHistory } from './history-sync.js';

const startSchema = z.object({ provider: z.enum(['messenger', 'instagram']) });
const selectSchema = z.object({ sessionId: z.string().uuid(), assetId: z.string().min(1) });
const disconnectSchema = z.object({ channelId: z.string().uuid() });
const stateHash = (state) => crypto.createHash('sha256').update(state).digest('hex');

function providerCredentials(config, provider) {
  return provider === 'instagram'
    ? {
        appId: config.META_INSTAGRAM_APP_ID || config.META_APP_ID,
        appSecret: config.META_INSTAGRAM_APP_SECRET
          || (config.META_INSTAGRAM_APP_ID ? '' : config.META_APP_SECRET),
      }
    : { appId: config.META_APP_ID, appSecret: config.META_APP_SECRET };
}

function configured(config, provider) {
  const credentials = providerCredentials(config, provider);
  return Boolean(credentials.appId && credentials.appSecret && config.META_OAUTH_REDIRECT_URI
    && config.CREDENTIAL_ENCRYPTION_KEY);
}

async function graphRequest(config, path, accessToken, options = {}) {
  const response = await fetch(`https://graph.facebook.com/${config.META_GRAPH_VERSION}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || `Meta Graph request failed with ${response.status}`);
    error.code = body.error?.code ? `meta_${body.error.code}` : 'meta_graph_failed';
    error.statusCode = 502;
    throw error;
  }
  return body;
}

async function instagramGraphRequest(config, path, accessToken, options = {}) {
  const response = await fetch(`https://graph.instagram.com/${config.META_GRAPH_VERSION}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || `Instagram Graph request failed with ${response.status}`);
    error.code = body.error?.code ? `meta_${body.error.code}` : 'instagram_graph_failed';
    error.statusCode = 502;
    throw error;
  }
  return body;
}

const webhookFields = Object.freeze({
  messenger: ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads'],
  instagram: [
    'messages', 'messaging_postbacks', 'messaging_seen', 'message_edit', 'message_reactions',
    'messaging_referral', 'messaging_optins', 'messaging_handover', 'standby',
  ],
});

function subscribedFields(config, provider) {
  const fields = [...webhookFields[provider]];
  if (provider === 'instagram' && config.META_ENABLE_COMMENT_MANAGEMENT) fields.push('comments', 'live_comments');
  return fields;
}

function subscriptionUrl(config, provider, accountId, graphMode = 'facebook_login') {
  const origin = provider === 'instagram' && graphMode === 'instagram_login'
    ? 'https://graph.instagram.com'
    : 'https://graph.facebook.com';
  return `${origin}/${config.META_GRAPH_VERSION}/${encodeURIComponent(accountId)}/subscribed_apps`;
}

export async function updateWebhookSubscription({
  config,
  provider,
  accountId,
  accessToken,
  graphMode = 'facebook_login',
  subscribe = true,
  fetchImpl = fetch,
}) {
  const url = new URL(subscriptionUrl(config, provider, accountId, graphMode));
  const fields = subscribedFields(config, provider);
  if (subscribe) url.searchParams.set('subscribed_fields', fields.join(','));
  const response = await fetchImpl(url, {
    method: subscribe ? 'POST' : 'DELETE',
    signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(body.error?.message || `Meta webhook subscription failed with ${response.status}`);
    error.code = subscribe ? 'meta_webhook_subscription_failed' : 'meta_webhook_unsubscribe_failed';
    error.statusCode = 502;
    throw error;
  }
  return { success: true, fields: subscribe ? fields : [] };
}

async function exchangeCode(config, code, provider) {
  const credentials = providerCredentials(config, provider);
  if (provider === 'instagram') {
    const short = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.appId,
        client_secret: credentials.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.META_OAUTH_REDIRECT_URI,
        code,
      }),
    });
    const shortBody = await short.json().catch(() => ({}));
    if (!short.ok || !shortBody.access_token) {
      throw new Error(shortBody.error_message || shortBody.error?.message || 'Instagram OAuth code exchange failed');
    }
    const longParams = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: credentials.appSecret,
      access_token: shortBody.access_token,
    });
    const long = await fetch(`https://graph.instagram.com/access_token?${longParams}`, {
      signal: AbortSignal.timeout(30000),
    });
    const longBody = await long.json().catch(() => ({}));
    if (!long.ok || !longBody.access_token) {
      const error = new Error(longBody.error?.message || 'Instagram long-lived token exchange failed');
      error.code = 'instagram_long_lived_token_exchange_failed';
      error.statusCode = 502;
      throw error;
    }
    return { ...shortBody, ...longBody };
  }
  const params = new URLSearchParams({
    client_id: credentials.appId,
    client_secret: credentials.appSecret,
    redirect_uri: config.META_OAUTH_REDIRECT_URI,
    code,
  });
  const short = await fetch(`https://graph.facebook.com/${config.META_GRAPH_VERSION}/oauth/access_token?${params}`, {
    signal: AbortSignal.timeout(30000),
  });
  const shortBody = await short.json().catch(() => ({}));
  if (!short.ok || !shortBody.access_token) throw new Error(shortBody.error?.message || 'Meta OAuth code exchange failed');
  const longParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: credentials.appId,
    client_secret: credentials.appSecret,
    fb_exchange_token: shortBody.access_token,
  });
  const long = await fetch(`https://graph.facebook.com/${config.META_GRAPH_VERSION}/oauth/access_token?${longParams}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!long.ok) return shortBody;
  return long.json();
}

async function loadSession(db, config, tenantId, actorSubject, sessionId) {
  const result = await db.query(
    `SELECT * FROM meta_oauth_sessions
     WHERE id = $1 AND tenant_id = $2 AND actor_subject = $3
       AND status = 'authorized' AND expires_at > now()`,
    [sessionId, tenantId, actorSubject],
  );
  if (!result.rowCount) {
    const error = new Error('Meta onboarding session is missing or expired');
    error.code = 'meta_oauth_session_invalid';
    error.statusCode = 404;
    throw error;
  }
  const session = result.rows[0];
  const credential = await resolveCredential(db, config, session.onboarding_credential_ref);
  if (!credential?.accessToken) throw new Error('Meta onboarding credential is unavailable');
  return { session, credential };
}

async function listAssets(config, accessToken, provider) {
  if (provider === 'instagram') {
    const account = await instagramGraphRequest(
      config,
      '/me?fields=user_id,username,name,account_type,profile_picture_url',
      accessToken,
    );
    const accountId = String(account.user_id || account.id || '');
    return accountId ? [{
      id: accountId,
      name: account.name || account.username || `Instagram ${accountId}`,
      access_token: accessToken,
      instagram_business_account: { id: accountId, username: account.username || account.name || null },
    }] : [];
  }
  const result = await graphRequest(config,
    '/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100', accessToken);
  return result.data || [];
}

export function metaOAuthPublicRoutes({ db, config }) {
  const router = Router();
  router.get('/oauth/meta/callback', async (req, res) => {
    const hash = stateHash(String(req.query.state || ''));
    const sessionResult = await db.query(
      `SELECT * FROM meta_oauth_sessions
       WHERE state_hash = $1 AND status = 'pending' AND expires_at > now()`, [hash],
    );
    if (!sessionResult.rowCount) return res.status(400).send('Invalid or expired Meta authorization state.');
    const session = sessionResult.rows[0];
    const dashboardUrl = new URL(config.CORS_ORIGIN);
    dashboardUrl.searchParams.set('service', 'channels');
    dashboardUrl.searchParams.set('meta_onboarding', session.id);
    try {
      if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
      const token = await exchangeCode(config, String(req.query.code || ''), session.provider);
      const reference = `meta-onboarding:${session.id}`;
      const expiresAt = token.expires_in
        ? new Date(Date.now() + Number(token.expires_in) * 1000)
        : new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);
      await saveCredential(db, config, {
        credentialRef: reference,
        provider: 'meta-onboarding',
        value: { accessToken: token.access_token, expiresAt: expiresAt.toISOString() },
        metadata: { tenantId: session.tenant_id, purpose: 'asset-discovery' },
        expiresAt,
      });
      await db.query(
        `UPDATE meta_oauth_sessions SET status = 'authorized', onboarding_credential_ref = $2
         WHERE id = $1`, [session.id, reference],
      );
      return res.redirect(303, dashboardUrl.toString());
    } catch (error) {
      await db.query(
        `UPDATE meta_oauth_sessions SET status = 'failed', error_message = $2 WHERE id = $1`,
        [session.id, String(error.message || error).slice(0, 2000)],
      );
      dashboardUrl.searchParams.set('meta_error', 'authorization_failed');
      return res.redirect(303, dashboardUrl.toString());
    }
  });
  return router;
}

export function metaOAuthTenantRoutes({ db, config }) {
  const router = Router({ mergeParams: true });
  router.post('/start', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin']);
    const input = startSchema.parse(req.body);
    if (!configured(config, input.provider)) return res.status(503).json({ error: 'meta_oauth_not_configured' });
    const credentials = providerCredentials(config, input.provider);
    const state = crypto.randomBytes(32).toString('base64url');
    const session = await db.query(
      `INSERT INTO meta_oauth_sessions
       (tenant_id, actor_subject, provider, state_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes') RETURNING id`,
      [req.params.tenantId, req.identity.subject, input.provider, stateHash(state)],
    );
    const scopes = input.provider === 'instagram'
      ? ['instagram_business_basic', 'instagram_business_manage_messages',
        ...(config.META_ENABLE_COMMENT_MANAGEMENT ? ['instagram_business_manage_comments'] : [])]
      : ['pages_show_list', 'pages_manage_metadata', 'pages_messaging', 'pages_read_engagement'];
    const url = new URL(input.provider === 'instagram'
      ? 'https://www.instagram.com/oauth/authorize'
      : `https://www.facebook.com/${config.META_GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set('client_id', credentials.appId);
    url.searchParams.set('redirect_uri', config.META_OAUTH_REDIRECT_URI);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(','));
    return res.status(201).json({ data: { sessionId: session.rows[0].id, authorizationUrl: url.toString() } });
  });

  router.get('/:sessionId/assets', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin']);
    const { session, credential } = await loadSession(db, config, req.params.tenantId, req.identity.subject, req.params.sessionId);
    const pages = await listAssets(config, credential.accessToken, session.provider);
    const assets = session.provider === 'instagram'
      ? pages.filter((page) => page.instagram_business_account).map((page) => ({
        id: page.instagram_business_account.id,
        name: page.instagram_business_account.username || page.name,
        linkedPageId: page.id,
      }))
      : pages.map((page) => ({ id: page.id, name: page.name }));
    return res.json({ data: { provider: session.provider, assets } });
  });

  router.post('/complete', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin']);
    const input = selectSchema.parse(req.body);
    const { session, credential } = await loadSession(db, config, req.params.tenantId, req.identity.subject, input.sessionId);
    const pages = await listAssets(config, credential.accessToken, session.provider);
    const page = session.provider === 'instagram'
      ? pages.find((item) => String(item.instagram_business_account?.id) === input.assetId)
      : pages.find((item) => String(item.id) === input.assetId);
    if (!page) return res.status(404).json({ error: 'meta_asset_not_found' });
    const externalAccountId = session.provider === 'instagram' ? page.instagram_business_account.id : page.id;
    const displayName = session.provider === 'instagram'
      ? page.instagram_business_account.username || page.name
      : page.name;
    const existing = await db.query(
      `SELECT id, tenant_id FROM channel_connections
       WHERE provider = $1 AND external_account_id = $2 AND status <> 'disabled' LIMIT 1`,
      [session.provider, externalAccountId],
    );
    if (existing.rowCount && existing.rows[0].tenant_id !== req.params.tenantId) {
      return res.status(409).json({ error: 'meta_asset_owned_by_another_tenant' });
    }
    if (!page.access_token) return res.status(422).json({ error: 'meta_page_access_token_missing' });
    const reference = `meta:${req.params.tenantId}:${session.provider}:${externalAccountId}`;
    await saveCredential(db, config, {
      credentialRef: reference,
      provider: session.provider,
      value: { accessToken: page.access_token, expiresAt: credential.expiresAt || null },
      metadata: { tenantId: req.params.tenantId, externalAccountId },
      expiresAt: credential.expiresAt ? new Date(credential.expiresAt) : null,
    });
    let subscription;
    try {
      subscription = await updateWebhookSubscription({
        config,
        provider: session.provider,
        accountId: externalAccountId,
        accessToken: page.access_token,
        graphMode: session.provider === 'instagram' ? 'instagram_login' : 'facebook_login',
      });
    } catch (error) {
      await deleteCredential(db, reference);
      throw error;
    }
    const channel = await db.query(
      `INSERT INTO channel_connections
       (tenant_id, provider, external_account_id, display_name, status, credential_ref, config)
       VALUES ($1, $2, $3, $4, 'active', $5, $6)
       ON CONFLICT (provider, external_account_id) WHERE status <> 'disabled'
       DO UPDATE SET display_name = EXCLUDED.display_name, credential_ref = EXCLUDED.credential_ref,
         status = 'active', config = EXCLUDED.config, last_error = NULL, updated_at = now()
      RETURNING *`,
      [req.params.tenantId, session.provider, externalAccountId, displayName, reference,
        JSON.stringify({
          graphMode: session.provider === 'instagram' ? 'instagram_login' : 'facebook_login',
          linkedPageId: page.id,
          webhookSubscription: 'active',
          subscribedFields: subscription.fields,
        })],
    );
    await db.query(
      `UPDATE channel_connections SET last_health_check_at = now(), updated_at = now() WHERE id = $1`,
      [channel.rows[0].id],
    );
    if (session.provider === 'instagram') {
      await syncInstagramHistory({
        db, config, channel: channel.rows[0], accessToken: page.access_token,
      }).catch(async (error) => {
        await db.query(
          'UPDATE channel_connections SET last_error = $2, updated_at = now() WHERE id = $1',
          [channel.rows[0].id, String(error.message || error).slice(0, 2000)],
        );
      });
    }
    await db.query(
      `INSERT INTO audit_logs (tenant_id, actor_subject, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'meta.channel.connected', 'channel_connection', $3, $4)`,
      [req.params.tenantId, req.identity.subject, channel.rows[0].id,
        JSON.stringify({ provider: session.provider, externalAccountId })],
    );
    await db.query(
      `UPDATE meta_oauth_sessions SET status = 'completed', completed_at = now() WHERE id = $1`,
      [session.id],
    );
    await deleteCredential(db, session.onboarding_credential_ref);
    return res.status(201).json({ data: channel.rows[0] });
  });

  router.post('/disconnect', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin']);
    const input = disconnectSchema.parse(req.body);
    const result = await db.query(
      `SELECT * FROM channel_connections
       WHERE id = $1 AND tenant_id = $2 AND provider IN ('messenger', 'instagram')
         AND status <> 'disabled'`,
      [input.channelId, req.params.tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'meta_channel_not_found' });
    const channel = result.rows[0];
    const credential = await resolveCredential(db, config, channel.credential_ref);
    if (credential?.accessToken) {
      await updateWebhookSubscription({
        config,
        provider: channel.provider,
        accountId: channel.external_account_id,
        accessToken: credential.accessToken,
        graphMode: channel.config?.graphMode || 'facebook_login',
        subscribe: false,
      });
    }
    await db.query(
      `UPDATE channel_connections SET status = 'disabled', credential_ref = NULL,
       config = config || $3::jsonb, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [channel.id, req.params.tenantId, JSON.stringify({ webhookSubscription: 'inactive', disconnectedAt: new Date().toISOString() })],
    );
    if (channel.credential_ref) await deleteCredential(db, channel.credential_ref);
    await db.query(
      `INSERT INTO audit_logs (tenant_id, actor_subject, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, 'meta.channel.disconnected', 'channel_connection', $3, $4)`,
      [req.params.tenantId, req.identity.subject, channel.id, JSON.stringify({ provider: channel.provider })],
    );
    return res.json({ data: { id: channel.id, status: 'disabled' } });
  });
  router.post('/sync', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin']);
    const result = await db.query(
      `SELECT * FROM channel_connections
       WHERE tenant_id = $1 AND provider = 'instagram' AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
      [req.params.tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'meta_channel_not_found' });
    const channel = result.rows[0];
    const credential = await resolveCredential(db, config, channel.credential_ref);
    if (!credential?.accessToken) return res.status(422).json({ error: 'meta_credential_missing' });
    const data = await syncInstagramHistory({ db, config, channel, accessToken: credential.accessToken });
    return res.json({ data });
  });
  return router;
}
