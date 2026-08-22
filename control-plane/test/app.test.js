import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, sanitizeHttpUrl } from '../src/app.js';

const config = {
  AUTH_DISABLED: true,
  CORS_ORIGIN: 'https://dashboard.example.com',
  OIDC_ISSUER: 'https://auth.example.com/realms/unified',
  OIDC_JWKS_URL: 'https://auth.example.com/realms/unified/protocol/openid-connect/certs',
  OIDC_CLIENT_ID: 'unified-dashboard',
  BRIDGE_SERVICE_SECRET: 'test-bridge-service-secret',
};

test('HTTP logging strips secrets from OAuth and webhook query strings', () => {
  const sanitized = sanitizeHttpUrl('/oauth/meta/callback?code=secret-code&state=secret-state&safe=value');
  assert.equal(sanitized, '/oauth/meta/callback?code=%5BREDACTED%5D&state=%5BREDACTED%5D&safe=value');
  assert.equal(sanitized.includes('secret-code'), false);
  assert.equal(sanitized.includes('secret-state'), false);

  const webhook = sanitizeHttpUrl('/webhooks/meta?hub.mode=subscribe&hub.verify_token=private-token&hub.challenge=123');
  assert.equal(webhook.includes('private-token'), false);
  assert.equal(webhook.includes('hub.challenge=123'), true);
});

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
