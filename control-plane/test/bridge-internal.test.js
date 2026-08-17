import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { bridgeInternalRoutes } from '../src/routes/bridge-internal.js';

test('bridge lookup requires its service token and returns tenant routing', async (t) => {
  const db = {
    async query(_sql, values) {
      assert.deepEqual(values, ['2', '9']);
      return { rowCount: 1, rows: [{ tenant_id: 'tenant-1', typebot_public_id: 'shop-assistant' }] };
    },
  };
  const app = express();
  app.use('/internal/v1/bridge', bridgeInternalRoutes(db, 'test-bridge-service-secret'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/internal/v1/bridge/routes/chatwoot/2/inboxes/9`;

  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers: { 'x-bridge-token': 'test-bridge-service-secret' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.typebot_public_id, 'shop-assistant');
});

