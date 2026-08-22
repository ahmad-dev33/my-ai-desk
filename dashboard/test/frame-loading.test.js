import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldLoadEmbeddedFrame } from '../src/frame-loading.js';

test('does not restart loading when returning to an already loaded Typebot frame', () => {
  assert.equal(shouldLoadEmbeddedFrame({
    key: 'flows',
    loadedFrames: { flows: true },
    frameTenantIds: {},
    selectedTenantId: 'tenant-1',
  }), false);
});

test('loads a frame the first time it is opened', () => {
  assert.equal(shouldLoadEmbeddedFrame({
    key: 'flows',
    loadedFrames: {},
    frameTenantIds: {},
    selectedTenantId: 'tenant-1',
  }), true);
});

test('reloads Chatwoot when the selected tenant changes', () => {
  assert.equal(shouldLoadEmbeddedFrame({
    key: 'inbox',
    loadedFrames: { inbox: true },
    frameTenantIds: { inbox: 'tenant-1' },
    selectedTenantId: 'tenant-2',
  }), true);
});

test('keeps the existing Chatwoot frame when returning to the same tenant', () => {
  assert.equal(shouldLoadEmbeddedFrame({
    key: 'inbox',
    loadedFrames: { inbox: true },
    frameTenantIds: { inbox: 'tenant-1' },
    selectedTenantId: 'tenant-1',
  }), false);
});

test('allows an explicit retry to reload an existing frame', () => {
  assert.equal(shouldLoadEmbeddedFrame({
    key: 'flows',
    loadedFrames: { flows: true },
    frameTenantIds: {},
    selectedTenantId: 'tenant-1',
    forceReload: true,
  }), true);
});
