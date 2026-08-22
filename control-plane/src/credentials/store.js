import crypto from 'node:crypto';

function encryptionKey(config) {
  const raw = config.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    const error = new Error('CREDENTIAL_ENCRYPTION_KEY is required for OAuth credential storage');
    error.code = 'credential_store_not_configured';
    error.statusCode = 503;
    throw error;
  }
  if (/^[a-f\d]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptCredential(config, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(config), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decryptCredential(config, row) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(config), row.iv);
  decipher.setAuthTag(row.auth_tag);
  return JSON.parse(Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString('utf8'));
}

export async function saveCredential(db, config, { credentialRef, provider, value, metadata = {}, expiresAt = null }) {
  const encrypted = encryptCredential(config, value);
  await db.query(
    `INSERT INTO provider_credentials
     (credential_ref, provider, ciphertext, iv, auth_tag, metadata, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (credential_ref) DO UPDATE SET provider = EXCLUDED.provider,
       ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, auth_tag = EXCLUDED.auth_tag,
       metadata = EXCLUDED.metadata, expires_at = EXCLUDED.expires_at, updated_at = now()`,
    [credentialRef, provider, encrypted.ciphertext, encrypted.iv, encrypted.authTag,
      JSON.stringify(metadata), expiresAt],
  );
  return credentialRef;
}

export async function resolveCredential(db, config, credentialRef) {
  if (!credentialRef) return null;
  let environment = {};
  try { environment = JSON.parse(config.META_CREDENTIALS_JSON || '{}'); } catch { environment = {}; }
  if (environment[credentialRef]) {
    return typeof environment[credentialRef] === 'string'
      ? { accessToken: environment[credentialRef] }
      : environment[credentialRef];
  }
  const result = await db.query(
    `SELECT * FROM provider_credentials
     WHERE credential_ref = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [credentialRef],
  );
  return result.rowCount ? decryptCredential(config, result.rows[0]) : null;
}

export async function deleteCredential(db, credentialRef) {
  if (!credentialRef) return;
  await db.query('DELETE FROM provider_credentials WHERE credential_ref = $1', [credentialRef]);
}

