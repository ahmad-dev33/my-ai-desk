import test from 'node:test';
import assert from 'node:assert/strict';
import { syncContactFromChatwoot } from '../src/crm/contact-sync.js';

test('Chatwoot sync keeps an existing display name when the payload omits one', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('SELECT contact_id FROM contact_identities')) {
        return { rows: [{ contact_id: 'contact-1' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE contact_profiles')) {
        return { rows: [{ id: 'contact-1', display_name: 'Existing name' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const db = { transaction: async (work) => work(client) };

  await syncContactFromChatwoot(db, 'tenant-1', { id: 55, custom_attributes: { tier: 'gold' } });

  const update = calls.find((call) => call.sql.includes('UPDATE contact_profiles'));
  assert.equal(update.values[0], null);
});
