import test from 'node:test';
import assert from 'node:assert/strict';
import { readMetaOAuthCallback, scheduleDelayed } from '../src/async-ui.js';

test('scheduleDelayed can cancel a pending search request', async () => {
  let calls = 0;
  const cancel = scheduleDelayed(() => { calls += 1; }, 10);
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 0);
});

test('reads Meta OAuth callback status from the dashboard query string', () => {
  assert.deepEqual(
    readMetaOAuthCallback('?service=channels&meta_onboarding=session-1&meta_error=authorization_failed'),
    { sessionId: 'session-1', error: 'authorization_failed' },
  );
});
