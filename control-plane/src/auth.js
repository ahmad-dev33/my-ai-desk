import { createRemoteJWKSet, jwtVerify } from 'jose';

export function tokenRoles(payload) {
  const realmRoles = payload.realm_access?.roles ?? [];
  const clientRoles = Object.values(payload.resource_access ?? {}).flatMap((access) => access.roles ?? []);
  return [...new Set([...realmRoles, ...clientRoles])];
}

export function createAuth(config) {
  const jwks = createRemoteJWKSet(new URL(config.OIDC_JWKS_URL));

  return async function authenticate(req, res, next) {
    if (config.AUTH_DISABLED) {
      req.identity = {
        subject: req.header('x-dev-subject') || 'development-user',
        email: req.header('x-dev-email') || 'dev@example.com',
        name: 'Development User',
        roles: ['platform-admin'],
      };
      return next();
    }

    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing_bearer_token' });
    }

    try {
      const { payload } = await jwtVerify(authorization.slice(7), jwks, {
        issuer: config.OIDC_ISSUER,
      });
      const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
      if (payload.azp !== config.OIDC_CLIENT_ID && !audience.includes(config.OIDC_CLIENT_ID)) {
        return res.status(401).json({ error: 'invalid_token_client' });
      }
      req.identity = {
        subject: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.preferred_username,
        roles: tokenRoles(payload),
      };
      return next();
    } catch (error) {
      req.log?.warn({ err: error }, 'OIDC token verification failed');
      return res.status(401).json({ error: 'invalid_bearer_token' });
    }
  };
}

export function requirePlatformAdmin(req, res, next) {
  if (!req.identity.roles.includes('platform-admin')) {
    return res.status(403).json({ error: 'platform_admin_required' });
  }
  return next();
}
