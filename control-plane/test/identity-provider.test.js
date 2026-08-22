import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityProvider } from '../src/identity-provider.js';

const config = {
  KEYCLOAK_ADMIN_BASE_URL: 'http://keycloak:8080',
  KEYCLOAK_REALM: 'unified',
  KEYCLOAK_ADMIN_CLIENT_ID: 'control-plane-admin',
  KEYCLOAK_ADMIN_CLIENT_SECRET: 'test-control-plane-secret',
};

test('identity provider creates an employee with a temporary password and operator role', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/protocol/openid-connect/token')) {
      return new Response(JSON.stringify({ access_token: 'token', expires_in: 60 }), { status: 200 });
    }
    if (url.endsWith('/admin/realms/unified/users') && options.method === 'POST') {
      return new Response(null, { status: 201, headers: { location: `${url}/employee-subject` } });
    }
    if (url.endsWith('/reset-password')) return new Response(null, { status: 204 });
    if (url.endsWith('/roles/operator')) {
      return new Response(JSON.stringify({ id: 'role-1', name: 'operator' }), { status: 200 });
    }
    if (url.endsWith('/role-mappings/realm')) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${options.method} ${url}`);
  };

  const provider = createIdentityProvider(config, fetchImpl);
  const result = await provider.createEmployee({
    email: 'employee@example.com',
    displayName: 'Employee One',
    temporaryPassword: 'temporary-password-123',
  });

  assert.deepEqual(result, { subject: 'employee-subject' });
  assert.equal(calls.filter((call) => call.url.endsWith('/protocol/openid-connect/token')).length, 1);
  const passwordCall = calls.find((call) => call.url.endsWith('/reset-password'));
  assert.deepEqual(JSON.parse(passwordCall.options.body), {
    type: 'password', value: 'temporary-password-123', temporary: true,
  });
  const mappingCall = calls.find((call) => call.url.endsWith('/role-mappings/realm'));
  assert.deepEqual(JSON.parse(mappingCall.options.body), [{ id: 'role-1', name: 'operator' }]);
});

test('identity provider is disabled when service-account configuration is absent', () => {
  assert.equal(createIdentityProvider({}), null);
});

