import express from 'express';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { createAuth } from './auth.js';
import { tenantRoutes } from './routes/tenants.js';
import { contactRoutes } from './routes/contacts.js';
import { automationRoutes } from './routes/automations.js';
import { productRoutes } from './routes/products.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { bridgeInternalRoutes } from './routes/bridge-internal.js';
import { channelRoutes } from './routes/channels.js';
import { webhookRoutes } from './routes/webhooks.js';
import { aiRagRoutes } from './routes/ai-rag.js';
import { manychatRoutes } from './routes/manychat.js';
import { operatorRoutes } from './routes/operators.js';
import { requireActiveOperator, upsertOperator } from './access.js';
import { createIdentityProvider } from './identity-provider.js';
import { createChatwootPlatform } from './chatwoot-platform.js';
import { sessionRoutes } from './routes/sessions.js';
import { metaPublicRoutes, metaTenantRoutes } from './meta/gateway.js';
import { metaOAuthPublicRoutes, metaOAuthTenantRoutes } from './meta/oauth.js';
import { metaComplianceRoutes } from './meta/compliance.js';

const SENSITIVE_QUERY_PARAMETERS = new Set([
  'access_token',
  'client_secret',
  'code',
  'hub.verify_token',
  'state',
  'token',
]);

export function sanitizeHttpUrl(value = '') {
  try {
    const parsed = new URL(value, 'http://internal.invalid');
    for (const name of SENSITIVE_QUERY_PARAMETERS) {
      if (parsed.searchParams.has(name)) parsed.searchParams.set(name, '[REDACTED]');
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return String(value).split('?')[0];
  }
}

function requestSerializer(req) {
  return {
    id: req.id,
    method: req.method,
    url: sanitizeHttpUrl(req.url),
    hostname: req.hostname,
    remoteAddress: req.remoteAddress,
    remotePort: req.remotePort,
  };
}

export function createApp({ config, db, redis }) {
  const app = express();
  const identityProvider = createIdentityProvider(config);
  const chatwootPlatform = createChatwootPlatform(config);
  app.disable('x-powered-by');
  app.use(pinoHttp({
    serializers: { req: requestSerializer },
  }));
  app.use((_req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'no-referrer');
    res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.header('Cross-Origin-Resource-Policy', 'same-site');
    res.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    next();
  });
  app.use(express.json({
    limit: '1mb',
    verify(req, _res, buffer) { req.rawBody = Buffer.from(buffer); },
  }));
  app.use((req, res, next) => {
    const origin = req.header('origin');
    const originAllowed = !origin || origin === config.CORS_ORIGIN;
    if (origin && originAllowed) res.header('Access-Control-Allow-Origin', config.CORS_ORIGIN);
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') return originAllowed ? res.sendStatus(204) : res.sendStatus(403);
    return next();
  });

  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  });

  app.use('/internal/v1/bridge', bridgeInternalRoutes(db, config.BRIDGE_SERVICE_SECRET));
  app.use(webhookRoutes({ db, config, redis }));
  app.use(metaPublicRoutes({ db, config }));
  app.use(metaOAuthPublicRoutes({ db, config }));
  app.use(metaComplianceRoutes({ db, config }));

  app.use('/v1', createAuth(config));
  app.use('/v1', requireActiveOperator(db));
  app.get('/v1/me', async (req, res) => {
    const operator = await upsertOperator(db, req.identity);
    res.json({ data: { ...operator, roles: req.identity.roles } });
  });
  app.use('/v1/tenants', tenantRoutes(db));
  app.use('/v1/operators', operatorRoutes(db, identityProvider, chatwootPlatform));
  app.use('/v1/sessions', sessionRoutes(db, chatwootPlatform));
  app.use('/v1/tenants/:tenantId/contacts', contactRoutes(db, config));
  app.use('/v1/tenants/:tenantId/automations', automationRoutes(db));
  app.use('/v1/tenants/:tenantId/products', productRoutes(db));
  app.use('/v1/tenants/:tenantId/knowledge', knowledgeRoutes(db));
  app.use('/v1/tenants/:tenantId/channels', channelRoutes(db));
  app.use('/v1/tenants/:tenantId/ai', aiRagRoutes(db, config));
  app.use('/v1/tenants/:tenantId/manychat', manychatRoutes(db));
  app.use('/v1/tenants/:tenantId/meta', metaTenantRoutes({ db, config }));
  app.use('/v1/tenants/:tenantId/meta/oauth', metaOAuthTenantRoutes({ db, config }));

  app.use((error, req, res, _next) => {
    req.log?.error({ err: error }, 'Request failed');
    if (error instanceof ZodError) {
      return res.status(422).json({ error: 'validation_error', details: error.issues });
    }
    if (error.code === '23505') return res.status(409).json({ error: 'resource_conflict' });
    return res.status(error.statusCode ?? 500).json({ error: error.code ?? 'internal_server_error' });
  });
  return app;
}
