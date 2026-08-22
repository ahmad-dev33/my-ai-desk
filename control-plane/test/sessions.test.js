import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { sessionRoutes } from '../src/routes/sessions.js';

async function serve(t, identity, db, platform) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.identity = identity; next(); });
  app.use('/v1/sessions', sessionRoutes(db, platform));
  app.use((error, _req, res, _next) => res.status(error.statusCode ?? 500).json({ error: error.code ?? 'internal_server_error' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('employee cannot obtain a Chatwoot session for an unassigned company', async (t) => {
  const db = { query: async () => ({ rowCount: 0, rows: [] }) };
  const platform = {
    ensureUserAccount: async () => assert.fail('Chatwoot must not be called'),
    createSession: async () => assert.fail('Chatwoot must not be called'),
  };
  const baseUrl = await serve(t, { subject: 'employee-1', email: 'agent@example.com', roles: ['operator'] }, db, platform);
  const response = await fetch(`${baseUrl}/v1/sessions/chatwoot`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId: '123e4567-e89b-42d3-a456-426614174000' }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'tenant_access_denied' });
});

test('assigned employee receives a company-scoped Chatwoot session', async (t) => {
  let queryIndex = 0;
  const db = {
    async query() {
      queryIndex += 1;
      if (queryIndex === 1) return { rowCount: 1, rows: [{ roles: ['operator'] }] };
      if (queryIndex === 2) return { rowCount: 1, rows: [{ chatwoot_account_id: '42' }] };
      if (queryIndex === 3) return { rowCount: 1, rows: [] };
      throw new Error('Unexpected database query');
    },
  };
  const platform = {
    async ensureUserAccount(input) {
      assert.equal(input.accountId, 42);
      assert.equal(input.role, 'agent');
      return { id: 9 };
    },
    async createSession(input) {
      assert.deepEqual(input, { userId: 9, accountId: 42 });
      return 'https://inbox.example.com/app/login?sso_auth_token=once&ssoAccountId=42';
    },
  };
  const baseUrl = await serve(t, {
    subject: 'employee-1', email: 'agent@example.com', name: 'Agent', roles: ['operator'],
  }, db, platform);
  const response = await fetch(`${baseUrl}/v1/sessions/chatwoot`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId: '123e4567-e89b-42d3-a456-426614174000' }),
  });
  assert.equal(response.status, 200);
  assert.match((await response.json()).data.url, /ssoAccountId=42/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
