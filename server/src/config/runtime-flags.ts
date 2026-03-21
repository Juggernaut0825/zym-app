function envFlag(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

export function isApiServerEnabled(): boolean {
  return envFlag('ENABLE_API_SERVER', true);
}

export function isWebSocketServerEnabled(): boolean {
  return envFlag('ENABLE_WEBSOCKET_SERVER', true);
}

export function isBackgroundCleanupEnabled(): boolean {
  return envFlag('ENABLE_BACKGROUND_CLEANUP', true);
}
