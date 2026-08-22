import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatwootPlatform } from '../src/chatwoot-platform.js';

const config = {
  CHATWOOT_BASE_URL: 'http://chatwoot-web:3000',
  CHATWOOT_PLATFORM_API_TOKEN: 'a'.repeat(48),
  CHATWOOT_PUBLIC_URL: 'https://inbox.example.com',
};

test('Chatwoot Platform API provisions an account member and returns a scoped short-lived login', async () => {
  const fetchImpl = async (url, options = {}) => {
    assert.equal(options.headers.api_access_token, config.CHATWOOT_PLATFORM_API_TOKEN);
    if (url.endsWith('/users') && options.method === 'POST') return new Response(JSON.stringify({ id: 11 }));
    if (url.endsWith('/accounts/7/account_users')) return new Response(JSON.stringify({ id: 19 }));
    if (url.endsWith('/users/11/login')) return new Response(JSON.stringify({ url: 'https://inbox.example.com/app/login?sso_auth_token=short-lived' }));
    throw new Error(`Unexpected URL: ${url}`);
  };
  const platform = createChatwootPlatform(config, fetchImpl);
  const user = await platform.ensureUserAccount({ email: 'agent@example.com', name: 'Agent', accountId: 7 });
  const url = await platform.createSession({ userId: user.id, accountId: 7 });
  assert.equal(url, 'https://inbox.example.com/app/login?sso_auth_token=short-lived&ssoAccountId=7');
});

test('Chatwoot Platform API rejects a returned login link from another origin', async () => {
  const platform = createChatwootPlatform(config, async () => new Response(JSON.stringify({ url: 'https://evil.example/login' })));
  await assert.rejects(
    platform.createSession({ userId: 11, accountId: 7 }),
    (error) => error.code === 'chatwoot_sso_invalid_origin' && error.statusCode === 502,
  );
});

test('Chatwoot Platform API failures are not treated as successful provisioning', async () => {
  const platform = createChatwootPlatform(
    config,
    async () => new Response(JSON.stringify({ error: 'invalid' }), { status: 401 }),
  );
  await assert.rejects(
    platform.ensureUserAccount({ email: 'agent@example.com', name: 'Agent', accountId: 7 }),
    (error) => error.code === 'chatwoot_platform_request_failed' && error.statusCode === 502,
  );
});
