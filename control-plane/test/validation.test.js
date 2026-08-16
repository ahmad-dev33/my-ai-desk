import test from 'node:test';
import assert from 'node:assert/strict';
import { pagination, slugify } from '../src/validation.js';
import { tokenRoles } from '../src/auth.js';

test('slugify creates stable URL-safe tenant slugs', () => {
  assert.equal(slugify('  Acme Retail سوريا  '), 'acme-retail');
});

test('pagination enforces safe bounds', () => {
  assert.deepEqual(pagination({ limit: '999', offset: '-2' }), { limit: 100, offset: 0 });
});

test('tokenRoles combines realm and client roles without duplicates', () => {
  assert.deepEqual(tokenRoles({
    realm_access: { roles: ['platform-admin', 'operator'] },
    resource_access: { dashboard: { roles: ['operator', 'editor'] } },
  }), ['platform-admin', 'operator', 'editor']);
});
