const runtimeProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const wsProtocol = runtimeProtocol === 'https:' ? 'wss:' : 'ws:';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function warnMissingProdEnv(name: string, fallback: string) {
  if (typeof window === 'undefined') return;
  if (isLocalHost(window.location.hostname)) return;
  console.error(`[config] ${name} is not set. Falling back to ${fallback}. Set an explicit production value.`);
}

const explicitApiBaseUrl = String(process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
const explicitWsUrl = String(process.env.NEXT_PUBLIC_WS_URL || '').trim();
const localApiFallback = `${runtimeProtocol}//${runtimeHost}:3001`;
const localWsFallback = `${wsProtocol}//${runtimeHost}:8080`;
const browserApiFallback = `${runtimeProtocol}//${runtimeHost}`;
const browserWsFallback = `${wsProtocol}//${runtimeHost}`;

const resolvedApiBaseUrl = explicitApiBaseUrl
  || (isLocalHost(runtimeHost) ? localApiFallback : browserApiFallback);
const resolvedWsUrl = explicitWsUrl
  || (isLocalHost(runtimeHost) ? localWsFallback : browserWsFallback);

if (!explicitApiBaseUrl) {
  warnMissingProdEnv('NEXT_PUBLIC_API_BASE_URL', resolvedApiBaseUrl);
}
if (!explicitWsUrl) {
  warnMissingProdEnv('NEXT_PUBLIC_WS_URL', resolvedWsUrl);
}

export const API_BASE_URL = normalizeBaseUrl(resolvedApiBaseUrl);
export const WS_URL = normalizeBaseUrl(resolvedWsUrl);

export function resolveApiAssetUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';

  if (
    value.startsWith('http://')
    || value.startsWith('https://')
    || value.startsWith('blob:')
    || value.startsWith('data:')
  ) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${API_BASE_URL}${value}`;
  }

  return `${API_BASE_URL}/${value}`;
}
