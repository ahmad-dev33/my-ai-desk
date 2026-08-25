export function scheduleDelayed(callback, delayMs = 300) {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
}

export function readMetaOAuthCallback(search) {
  const params = new URLSearchParams(search);
  return {
    sessionId: params.get('meta_onboarding') || '',
    error: params.get('meta_error') || '',
  };
}
