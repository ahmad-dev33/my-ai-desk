import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, generateEmbedding } from '../src/rag/rag-engine.js';
import { dispatchBroadcast, evaluateKeywords } from '../src/manychat/parity-engine.js';

test('chunkText splits document content cleanly into chunks', () => {
  const text = 'This is the first paragraph of the document. '.repeat(10) + '\n' + 'This is the second paragraph. '.repeat(10);
  const chunks = chunkText(text, { chunkSize: 200, overlap: 30 });
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].ordinal, 0);
  assert.ok(chunks[0].content.length <= 200);
  assert.ok(chunks[0].tokenCount > 0);
});

test('generateEmbedding produces a normalized 1536-dimensional vector', async () => {
  const embedding = await generateEmbedding('مرحباً بك في الخدمة');
  assert.equal(embedding.length, 1536);
  assert.ok(typeof embedding[0] === 'number');
  // Check L2 magnitude is close to 1
  const mag = Math.sqrt(embedding.reduce((acc, v) => acc + v * v, 0));
  assert.ok(Math.abs(mag - 1.0) < 0.01);
});

test('generateEmbedding refuses synthetic vectors in production', async (t) => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.OPENAI_API_KEY;
  t.after(() => {
    process.env.NODE_ENV = originalEnvironment;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });

  await assert.rejects(() => generateEmbedding('production knowledge'), /OPENAI_API_KEY is required/);
});

test('evaluateKeywords matches exact, contains, and starts_with keyword rules', async () => {
  const mockDb = {
    query: async () => ({
      rows: [
        {
          id: 'rule-1',
          keyword: 'سعر',
          match_type: 'contains',
          action_type: 'send_reply',
          action_payload: { reply: 'الأسعار تبدأ من 50 دولار' },
          priority: 10,
        },
      ],
    }),
  };

  const match = await evaluateKeywords(mockDb, 'tenant-123', 'كم سعر هذا المنتج؟');
  assert.ok(match);
  assert.equal(match.id, 'rule-1');
  assert.equal(match.action_type, 'send_reply');
});

test('dispatchBroadcast schedules delivery without fabricating sent analytics', async () => {
  const queries = [];
  const db = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('SELECT * FROM broadcast_campaigns')) {
        return { rowCount: 1, rows: [{ id: 'campaign-1' }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };

  const result = await dispatchBroadcast(db, 'tenant-1', 'campaign-1');
  assert.deepEqual(result, {
    campaignId: 'campaign-1', totalRecipients: 0, sentCount: 0, status: 'scheduled', deliveryConfigured: false,
  });
  assert.equal(queries.some((sql) => sql.includes('FROM contact_profiles')), false);
  assert.equal(queries.some((sql) => sql.includes('INSERT INTO campaign_analytics')), false);
});
