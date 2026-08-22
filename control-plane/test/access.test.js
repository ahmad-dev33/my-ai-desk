import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTenantAccess, requireActiveOperator } from '../src/access.js';

test('platform administrator bypasses tenant membership lookup', async () => {
  let queried = false;
  await assertTenantAccess({ query: async () => { queried = true; } }, { roles: ['platform-admin'] }, 'tenant-1');
  assert.equal(queried, false);
});

test('active employee can access an assigned tenant with an accepted role', async () => {
  const db = { query: async () => ({ rowCount: 1, rows: [{ roles: ['operator', 'automation-editor'] }] }) };
  await assertTenantAccess(db, { subject: 'employee-1', roles: ['operator'] }, 'tenant-1', ['operator']);
});

test('employee is denied when no active assignment exists', async () => {
  const db = { query: async () => ({ rowCount: 0, rows: [] }) };
  await assert.rejects(
    assertTenantAccess(db, { subject: 'employee-1', roles: ['operator'] }, 'tenant-2'),
    (error) => error.statusCode === 403 && error.code === 'tenant_access_denied',
  );
});

test('employee is denied when the assignment lacks the required role', async () => {
  const db = { query: async () => ({ rowCount: 1, rows: [{ roles: ['operator'] }] }) };
  await assert.rejects(
    assertTenantAccess(db, { subject: 'employee-1', roles: ['operator'] }, 'tenant-1', ['tenant-admin']),
    (error) => error.statusCode === 403 && error.code === 'tenant_role_denied',
  );
});

test('platform administrator bypasses operator status lookup', async () => {
  let queried = false;
  const middleware = requireActiveOperator({ query: async () => { queried = true; } });
  let continued = false;
  await middleware(
    { identity: { roles: ['platform-admin'] } },
    {},
    () => { continued = true; },
  );
  assert.equal(queried, false);
  assert.equal(continued, true);
});

test('suspended employee is rejected even while an old token is valid', async () => {
  const middleware = requireActiveOperator({ query: async () => ({ rowCount: 1, rows: [{ status: 'suspended' }] }) });
  let responseStatus;
  let responseBody;
  await middleware(
    { identity: { subject: 'employee-1', roles: ['operator'] } },
    { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; } },
    () => assert.fail('suspended employee must not continue'),
  );
  assert.equal(responseStatus, 403);
  assert.deepEqual(responseBody, { error: 'operator_suspended' });
});

test('unknown employee identity is rejected', async () => {
  const middleware = requireActiveOperator({ query: async () => ({ rowCount: 0, rows: [] }) });
  let responseStatus;
  let responseBody;
  await middleware(
    { identity: { subject: 'unknown', roles: ['operator'] } },
    { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; } },
    () => assert.fail('unknown employee must not continue'),
  );
  assert.equal(responseStatus, 403);
  assert.deepEqual(responseBody, { error: 'operator_not_registered' });
});
