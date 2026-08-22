function providerError(code, statusCode, cause) {
  const error = new Error(code, { cause });
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function createIdentityProvider(config, fetchImpl = fetch) {
  const baseUrl = config.KEYCLOAK_ADMIN_BASE_URL?.replace(/\/$/, '');
  const realm = encodeURIComponent(config.KEYCLOAK_REALM ?? 'unified');
  const clientId = config.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = config.KEYCLOAK_ADMIN_CLIENT_SECRET;

  if (!baseUrl || !clientId || !clientSecret) return null;

  let cachedToken = null;
  let expiresAt = 0;

  async function getToken() {
    if (cachedToken && Date.now() < expiresAt - 10_000) return cachedToken;
    const response = await fetchImpl(`${baseUrl}/realms/${realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    if (!response.ok) throw providerError('identity_provider_auth_failed', 502);
    const payload = await response.json();
    cachedToken = payload.access_token;
    expiresAt = Date.now() + Number(payload.expires_in ?? 60) * 1000;
    return cachedToken;
  }

  async function request(path, options = {}) {
    const token = await getToken();
    const response = await fetchImpl(`${baseUrl}/admin/realms/${realm}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    if (response.status === 409) throw providerError('employee_identity_conflict', 409);
    if (!response.ok) throw providerError('identity_provider_request_failed', 502);
    return response;
  }

  async function createEmployee({ email, displayName, temporaryPassword }) {
    const names = displayName.trim().split(/\s+/);
    const response = await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: email,
        email,
        firstName: names.shift() ?? displayName,
        lastName: names.join(' '),
        enabled: true,
        emailVerified: false,
      }),
    });
    const location = response.headers.get('location');
    const subject = location?.split('/').filter(Boolean).pop();
    if (!subject) throw providerError('identity_provider_missing_user_id', 502);

    try {
      await request(`/users/${encodeURIComponent(subject)}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ type: 'password', value: temporaryPassword, temporary: true }),
      });
      const roleResponse = await request('/roles/operator');
      const role = await roleResponse.json();
      await request(`/users/${encodeURIComponent(subject)}/role-mappings/realm`, {
        method: 'POST',
        body: JSON.stringify([role]),
      });
      return { subject };
    } catch (error) {
      await request(`/users/${encodeURIComponent(subject)}`, { method: 'DELETE' }).catch(() => {});
      throw error;
    }
  }

  async function setEmployeeEnabled(subject, enabled) {
    await request(`/users/${encodeURIComponent(subject)}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  }

  async function deleteEmployee(subject) {
    await request(`/users/${encodeURIComponent(subject)}`, { method: 'DELETE' });
  }

  return { createEmployee, setEmployeeEnabled, deleteEmployee };
}

