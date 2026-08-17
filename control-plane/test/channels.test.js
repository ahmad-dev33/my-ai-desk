import test from 'node:test';
import assert from 'node:assert/strict';
import { channelSchema } from '../src/routes/channels.js';

test('channel routing accepts Chatwoot account, inbox and automation mapping', () => {
  const channel = channelSchema.parse({
    provider: 'instagram',
    externalAccountId: 'instagram-page-1',
    displayName: 'متجر دمشق',
    status: 'active',
    credentialRef: 'shop-damascus-chatwoot',
    chatwootAccountId: 2,
    chatwootInboxId: 9,
    automationId: '123e4567-e89b-42d3-a456-426614174000',
  });
  assert.equal(channel.chatwootAccountId, 2);
  assert.equal(channel.chatwootInboxId, 9);
  assert.equal(channel.status, 'active');
});

test('channel routing rejects invalid Chatwoot IDs', () => {
  const result = channelSchema.safeParse({
    provider: 'messenger', externalAccountId: 'page', displayName: 'Page', chatwootInboxId: 0,
  });
  assert.equal(result.success, false);
});

