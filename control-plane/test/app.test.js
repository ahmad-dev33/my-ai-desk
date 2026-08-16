import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const config = {
  AUTH_DISABLED: true,
  CORS_ORIGIN: 'https://dashboard.example.com',
  OIDC_ISSUER: 'https://auth.example.com/realms/unified',
  OIDC_JWKS_URL: 'https://auth.example.com/realms/unified/protocol/openid-connect/certs',
  OIDC_CLIENT_ID: 'unified-dashboard',
};

test('health and authenticated identity endpoints respond', async (t) => {
  const db = {
    async query(sql) {
      if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };
      if (sql.includes('INSERT INTO operators')) {
        return { rows: [{ id: 'operator-1', email: 'dev@example.com' }], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const app = createApp({ config, db });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/health/ready`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ready' });

  const me = await fetch(`${baseUrl}/v1/me`);
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.data.email, 'dev@example.com');
  assert.deepEqual(body.data.roles, ['platform-admin']);
});
