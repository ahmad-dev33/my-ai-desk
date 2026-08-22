import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptCredential, encryptCredential } from '../src/credentials/store.js';

test('provider credentials are encrypted with authenticated AES-GCM', () => {
  const config = { CREDENTIAL_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };
  const encrypted = encryptCredential(config, { accessToken: 'secret-token', accountId: 'page-1' });
  assert.equal(encrypted.ciphertext.includes(Buffer.from('secret-token')), false);
  const value = decryptCredential(config, {
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
  });
  assert.deepEqual(value, { accessToken: 'secret-token', accountId: 'page-1' });
  const tampered = Buffer.from(encrypted.ciphertext);
  tampered[0] ^= 1;
  assert.throws(() => decryptCredential(config, {
    ciphertext: tampered, iv: encrypted.iv, auth_tag: encrypted.authTag,
  }));
});

