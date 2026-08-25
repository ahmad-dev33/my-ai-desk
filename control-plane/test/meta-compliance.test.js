import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { parseMetaSignedRequest } from '../src/meta/compliance.js';

test('Meta compliance callback accepts only a valid HMAC-SHA256 signed request', () => {
  const secret = 'a-professional-test-secret';
  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '1784' })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  assert.equal(parseMetaSignedRequest(`${signature}.${payload}`, [secret]).user_id, '1784');
  assert.equal(parseMetaSignedRequest(`${signature}.${payload}`, ['wrong-secret']), null);
});
