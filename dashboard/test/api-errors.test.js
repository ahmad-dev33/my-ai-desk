import test from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorMessage } from '../src/api-errors.js';

test('Chatwoot tenant binding errors are shown as an actionable Arabic message', () => {
  const message = apiErrorMessage('tenant_chatwoot_account_not_configured', 409);
  assert.match(message, /صندوق المحادثات غير مهيأ/);
  assert.match(message, /إعداد القناة/);
  assert.doesNotMatch(message, /tenant_chatwoot_account_not_configured/);
});

test('unknown API errors remain available for diagnosis', () => {
  assert.equal(apiErrorMessage('unexpected_error', 500), 'unexpected_error');
  assert.equal(apiErrorMessage('', 503), 'تعذر إكمال الطلب (503).');
});
