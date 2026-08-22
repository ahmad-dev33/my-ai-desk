import test from 'node:test';
import assert from 'node:assert/strict';
import { answerTenantQuestion } from '../src/ai/tenant-answer.js';

test('tenant answer uses only products belonging to the requested tenant', async () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT * FROM ai_handoff_policies')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id, sku, name')) return { rows: [{
        id: 'product-1', sku: 'SKU-1', name: 'الحقيبة الزرقاء', description: 'حقيبة جلدية',
        price_minor: 12500, currency: 'USD', inventory_quantity: 3, attributes: {},
      }], rowCount: 1 };
      if (sql.includes('FROM knowledge_chunks')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO ai_decision_events')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const result = await answerTenantQuestion({
    db,
    config: { OPENAI_API_KEY: '', OPENAI_MODEL: 'gpt-5-mini' },
    tenantId,
    question: 'كم سعر الحقيبة الزرقاء؟',
    channelConnectionId: 'channel-1',
    contactId: 'contact-1',
    inboundMessageId: 'message-1',
  });
  assert.equal(result.action, 'answer');
  assert.match(result.reply, /125/);
  const scopedReads = calls.filter((call) => call.sql.includes('catalog_products') || call.sql.includes('knowledge_chunks'));
  assert.ok(scopedReads.every((call) => call.params[0] === tenantId));
  assert.deepEqual(result.sources.productIds, ['product-1']);
});

test('tenant answer hands off instead of inventing facts when context is absent', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT * FROM ai_handoff_policies')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id, sku, name') || sql.includes('FROM knowledge_chunks')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO ai_decision_events')) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const result = await answerTenantQuestion({
    db, config: {}, tenantId: 'tenant-2', question: 'هل لديكم فرع على القمر؟',
  });
  assert.equal(result.action, 'no_context');
  assert.match(result.reply, /موظف|representative/);
});

