import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowTenantBar } from '../src/layout.js';

test('inbox shows company context when companies are available', () => {
  assert.equal(shouldShowTenantBar({ tenantCount: 1, service: { native: false }, active: 'inbox' }), true);
});

test('pages without a rendered tenant selector keep the two-row full-height layout', () => {
  assert.equal(shouldShowTenantBar({ tenantCount: 1, service: { native: true }, active: 'overview' }), false);
  assert.equal(shouldShowTenantBar({ tenantCount: 0, service: { native: false }, active: 'inbox' }), false);
});
