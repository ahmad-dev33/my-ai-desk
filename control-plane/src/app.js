import express from 'express';
import pinoHttp from 'pino-http';
import { ZodError } from 'zod';
import { createAuth } from './auth.js';
import { tenantRoutes } from './routes/tenants.js';
import { contactRoutes } from './routes/contacts.js';
import { automationRoutes } from './routes/automations.js';
import { productRoutes } from './routes/products.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { upsertOperator } from './access.js';

export function createApp({ config, db }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp());
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.CORS_ORIGIN);
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  });

  app.use('/v1', createAuth(config));
  app.get('/v1/me', async (req, res) => {
    const operator = await upsertOperator(db, req.identity);
    res.json({ data: { ...operator, roles: req.identity.roles } });
  });
  app.use('/v1/tenants', tenantRoutes(db));
  app.use('/v1/tenants/:tenantId/contacts', contactRoutes(db));
  app.use('/v1/tenants/:tenantId/automations', automationRoutes(db));
  app.use('/v1/tenants/:tenantId/products', productRoutes(db));
  app.use('/v1/tenants/:tenantId/knowledge', knowledgeRoutes(db));

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
