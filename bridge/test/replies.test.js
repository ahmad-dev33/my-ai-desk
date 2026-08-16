import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTypebotReplies } from '../src/replies.js';

test('extracts Typebot rich-text bubbles in order', () => {
  const payload = { messages: [
    { content: { richText: [{ type: 'p', children: [{ text: 'مرحباً ' }, { text: 'بك' }] }] } },
    { content: { plainText: 'كيف أساعدك؟' } },
  ] };
  assert.deepEqual(extractTypebotReplies(payload), ['مرحباً بك', 'كيف أساعدك؟']);
});

test('drops non-text actions', () => {
  assert.deepEqual(extractTypebotReplies({ messages: [{ type: 'video', content: { url: 'https://example.com/a.mp4' } }] }), []);
});
