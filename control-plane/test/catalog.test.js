import test from 'node:test';
import assert from 'node:assert/strict';
import { productSchema } from '../src/routes/products.js';
import { knowledgeDocumentSchema } from '../src/routes/knowledge.js';

test('product input normalizes currency and preserves tenant catalog fields', () => {
  const product = productSchema.parse({
    sku: 'SKU-1',
    name: 'قميص أسود',
    priceMinor: 125000,
    currency: 'syp',
    inventoryQuantity: 4,
  });
  assert.equal(product.currency, 'SYP');
  assert.equal(product.status, 'active');
  assert.equal(product.priceMinor, 125000);
  assert.deepEqual(product.mediaUrls, []);
});

test('URL knowledge sources require a source URI', () => {
  const result = knowledgeDocumentSchema.safeParse({ title: 'المتجر', sourceKind: 'url' });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], 'sourceUri');
});

test('text knowledge sources reject empty content', () => {
  const result = knowledgeDocumentSchema.safeParse({ title: 'الأسئلة', sourceKind: 'faq', content: '  ' });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], 'content');
});

