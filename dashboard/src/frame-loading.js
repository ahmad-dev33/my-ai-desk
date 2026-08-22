export function shouldLoadEmbeddedFrame({ key, loadedFrames, frameTenantIds, selectedTenantId, forceReload = false }) {
  if (forceReload) return true;
  if (!loadedFrames[key]) return true;
  return key === 'inbox' && frameTenantIds.inbox !== selectedTenantId;
}
