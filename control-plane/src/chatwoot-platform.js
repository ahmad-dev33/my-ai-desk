import { randomBytes } from 'node:crypto';

function platformError(code, statusCode, cause) {
  const error = new Error(code, { cause });
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function createChatwootPlatform(config, fetchImpl = fetch) {
  const baseUrl = config.CHATWOOT_BASE_URL?.replace(/\/$/, '');
  const token = config.CHATWOOT_PLATFORM_API_TOKEN;
  const publicOrigin = config.CHATWOOT_PUBLIC_URL ? new URL(config.CHATWOOT_PUBLIC_URL).origin : null;
  if (!baseUrl || !token || !publicOrigin) return null;

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/platform/api/v1${path}`, {
        ...options,
        headers: {
          api_access_token: token,
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...options.headers,
        },
      });
    } catch (cause) {
      throw platformError('chatwoot_platform_unavailable', 502, cause);
    }
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw platformError('chatwoot_platform_request_failed', 502);
    return body;
  }

  async function ensureUserAccount({ email, name, accountId, role = 'agent' }) {
    const user = await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        name,
        password: `Aa1!${randomBytes(24).toString('base64url')}`,
      }),
    });
    if (!user?.id) throw platformError('chatwoot_platform_invalid_user', 502);
    await request(`/accounts/${accountId}/account_users`, {
      method: 'POST',
      body: JSON.stringify({ user_id: user.id, role }),
    });
    return user;
  }

  async function removeUserAccount({ userId, accountId }) {
    await request(`/accounts/${accountId}/account_users`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async function createSession({ userId, accountId }) {
    const body = await request(`/users/${userId}/login`);
    let url;
    try {
      url = new URL(body.url);
    } catch (cause) {
      throw platformError('chatwoot_sso_invalid_response', 502, cause);
    }
    if (url.origin !== publicOrigin) throw platformError('chatwoot_sso_invalid_origin', 502);
    url.searchParams.set('ssoAccountId', String(accountId));
    return url.href;
  }

  return { ensureUserAccount, removeUserAccount, createSession };
}
