export async function upsertOperator(db, identity) {
  const result = await db.query(
    `INSERT INTO operators (oidc_subject, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (oidc_subject) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       last_login_at = now(),
       updated_at = now()
     RETURNING *`,
    [identity.subject, identity.email ?? `${identity.subject}@unknown.invalid`, identity.name ?? identity.email ?? identity.subject],
  );
  return result.rows[0];
}

export function requireActiveOperator(db) {
  return async function activeOperator(req, res, next) {
    if (req.identity.roles.includes('platform-admin')) return next();
    try {
      const result = await db.query(
        `SELECT status FROM operators WHERE oidc_subject = $1`,
        [req.identity.subject],
      );
      if (!result.rowCount) return res.status(403).json({ error: 'operator_not_registered' });
      if (result.rows[0].status !== 'active') {
        return res.status(403).json({ error: 'operator_suspended' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export async function assertTenantAccess(db, identity, tenantId, acceptedRoles = []) {
  if (identity.roles.includes('platform-admin')) return;
  const result = await db.query(
    `SELECT m.roles FROM memberships m
     JOIN operators o ON o.id = m.operator_id
     JOIN tenants t ON t.id = m.tenant_id
     WHERE o.oidc_subject = $1 AND m.tenant_id = $2
       AND o.status = 'active' AND t.status = 'active'`,
    [identity.subject, tenantId],
  );
  if (!result.rowCount) {
    const error = new Error('Tenant access denied');
    error.statusCode = 403;
    error.code = 'tenant_access_denied';
    throw error;
  }
  if (acceptedRoles.length && !result.rows[0].roles.some((role) => acceptedRoles.includes(role))) {
    const error = new Error('Tenant role denied');
    error.statusCode = 403;
    error.code = 'tenant_role_denied';
    throw error;
  }
}
