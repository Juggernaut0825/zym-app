const runtimeProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const wsProtocol = runtimeProtocol === 'https:' ? 'wss:' : 'ws:';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || `${runtimeProtocol}//${runtimeHost}:3001`;
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || `${wsProtocol}//${runtimeHost}:8080`;

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
    return `${API_BASE_URL.replace(/\/$/, '')}${value}`;
  }

  return `${API_BASE_URL.replace(/\/$/, '')}/${value}`;
}
