import crypto from 'node:crypto';

export function secureEqual(left = '', right = '') {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signMetaPayload(rawBody, appSecret) {
  return `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

export function verifyMetaSignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || !appSecret || !signature?.startsWith('sha256=')) return false;
  return secureEqual(signature, signMetaPayload(rawBody, appSecret));
}

