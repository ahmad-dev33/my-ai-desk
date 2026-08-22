import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('desktop app manifest is installable and scoped to the dashboard', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.match(manifest.start_url, /^\//);
  assert.ok(manifest.icons.some((icon) => icon.purpose.includes('maskable')));
});

test('service worker avoids intercepting SSO helpers', async () => {
  const worker = await fs.readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /url\.pathname\.startsWith\('\/sso\/'\)/);
  assert.match(worker, /request\.method !== 'GET'/);
});
