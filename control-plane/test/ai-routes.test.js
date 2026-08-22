import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { aiRagRoutes } from '../src/routes/ai-rag.js';

async function withServer(db, config, work) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.identity = { subject: 'admin-1', roles: ['platform-admin'], email: 'admin@example.com' };
    next();
  });
  app.use('/v1/tenants/:tenantId/ai', aiRagRoutes(db, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await work(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('AI policy status exposes provider readiness without exposing the API key', async () => {
  const db = { query: async () => ({ rowCount: 0, rows: [] }) };
  await withServer(db, { OPENAI_API_KEY: 'server-secret', OPENAI_MODEL: 'gpt-5-mini' }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/tenants/11111111-1111-1111-1111-111111111111/ai/policy`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.provider.configured, true);
    assert.equal(body.data.provider.model, 'gpt-5-mini');
    assert.equal(JSON.stringify(body).includes('server-secret'), false);
  });
});

test('AI dashboard test uses the canonical tenant product answer pipeline', async () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const db = {
    async query(sql) {
      if (sql.includes('SELECT * FROM ai_handoff_policies')) return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT id, sku, name')) return { rowCount: 1, rows: [{
        id: 'product-1', sku: 'BAG-1', name: 'الحقيبة الزرقاء', description: 'حقيبة جلدية',
        price_minor: 12500, currency: 'USD', inventory_quantity: 3, attributes: {},
      }] };
      if (sql.includes('FROM knowledge_chunks')) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO ai_decision_events')) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  await withServer(db, { OPENAI_API_KEY: '', OPENAI_MODEL: 'gpt-5-mini' }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/tenants/${tenantId}/ai/query`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'كم سعر الحقيبة الزرقاء؟', topK: 5 }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.action, 'answer');
    assert.match(body.data.reply, /125/);
    assert.deepEqual(body.data.sources.productIds, ['product-1']);
  });
});
