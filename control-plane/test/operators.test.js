import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { operatorRoutes } from '../src/routes/operators.js';

async function serve(t, identity, db, identityProvider = null, chatwootPlatform = null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.identity = identity; next(); });
  app.use('/v1/operators', operatorRoutes(db, identityProvider, chatwootPlatform));
  app.use((error, _req, res, _next) => res.status(error.statusCode ?? 500).json({ error: error.code ?? 'internal_server_error' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('employee cannot access platform employee administration', async (t) => {
  const db = { query: async () => assert.fail('database must not be queried') };
  const baseUrl = await serve(t, { subject: 'employee-1', roles: ['operator'] }, db);
  const response = await fetch(`${baseUrl}/v1/operators`);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'platform_admin_required' });
});

test('administrator can assign one employee to a company with an audited role', async (t) => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT id FROM operators')) return { rowCount: 1, rows: [{ id: 'operator-1' }] };
      if (sql.startsWith('SELECT id FROM tenants')) return { rowCount: 1, rows: [{ id: 'tenant-1' }] };
      if (sql.includes('INSERT INTO memberships')) {
        return { rowCount: 1, rows: [{ operator_id: 'operator-1', tenant_id: 'tenant-1', roles: ['operator'] }] };
      }
      if (sql.includes('INSERT INTO audit_logs')) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const db = {
    transaction: async (work) => work(client),
    async query(sql) {
      if (sql.includes('LEFT JOIN tenant_chatwoot_accounts')) {
        return { rowCount: 1, rows: [{ email: 'employee@example.com', display_name: 'Employee', chatwoot_account_id: null }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const baseUrl = await serve(t, { subject: 'admin-1', roles: ['platform-admin'] }, db);
  const response = await fetch(`${baseUrl}/v1/operators/operator-1/memberships/tenant-1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roles: ['operator'] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.roles, ['operator']);
  assert.equal(queries.some(({ sql }) => sql.includes("'membership.upserted'")), true);
});

test('administrator cannot suspend their own account', async (t) => {
  const db = {
    async query(sql) {
      if (sql.startsWith('SELECT * FROM operators')) {
        return { rowCount: 1, rows: [{ id: 'admin-operator', oidc_subject: 'admin-1', status: 'active' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const identityProvider = { setEmployeeEnabled: async () => assert.fail('identity must not be changed') };
  const baseUrl = await serve(t, { subject: 'admin-1', roles: ['platform-admin'] }, db, identityProvider);
  const response = await fetch(`${baseUrl}/v1/operators/admin-operator`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'cannot_change_own_operator_status' });
});

test('suspending an employee revokes every assigned Chatwoot account before disabling login', async (t) => {
  const events = [];
  const client = {
    async query(sql) {
      if (sql.startsWith('UPDATE operators')) return { rowCount: 1, rows: [{ id: 'operator-2', status: 'suspended' }] };
      if (sql.includes('INSERT INTO audit_logs')) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
  };
  const db = {
    async query(sql) {
      if (sql.startsWith('SELECT * FROM operators')) {
        return { rowCount: 1, rows: [{ id: 'operator-2', oidc_subject: 'employee-2', status: 'active', chatwoot_user_id: 77 }] };
      }
      if (sql.includes('FROM memberships m')) {
        return { rowCount: 2, rows: [{ chatwoot_account_id: '10' }, { chatwoot_account_id: '20' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    transaction: async (work) => work(client),
  };
  const identityProvider = {
    async setEmployeeEnabled(subject, enabled) { events.push(`keycloak:${subject}:${enabled}`); },
  };
  const chatwootPlatform = {
    async removeUserAccount({ userId, accountId }) { events.push(`chatwoot:${userId}:${accountId}`); },
  };
  const baseUrl = await serve(
    t,
    { subject: 'admin-1', roles: ['platform-admin'] },
    db,
    identityProvider,
    chatwootPlatform,
  );
  const response = await fetch(`${baseUrl}/v1/operators/operator-2`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    'chatwoot:77:10',
    'chatwoot:77:20',
    'keycloak:employee-2:false',
  ]);
});
