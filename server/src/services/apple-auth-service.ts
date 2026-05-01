import crypto, { type JsonWebKey } from 'crypto';
import jwt from 'jsonwebtoken';

type AppleSigningKey = JsonWebKey & {
  kty: 'RSA';
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
};

interface AppleKeysResponse {
  keys?: AppleSigningKey[];
}

export interface VerifiedAppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

let cachedKeys: { fetchedAt: number; keys: AppleSigningKey[] } | null = null;

function resolveAppleAudiences(): string[] {
  return Array.from(new Set(
    [
      process.env.APPLE_CLIENT_ID,
      process.env.APPLE_IOS_APP_ID,
      process.env.APPLE_SERVICE_ID,
      process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
      process.env.IOS_BUNDLE_ID,
      process.env.NEXT_PUBLIC_IOS_BUNDLE_ID,
      process.env.BUNDLE_IDENTIFIER,
      'com.zym8.app',
      'com.zym.app',
      ...String(process.env.APPLE_CLIENT_IDS || '')
        .split(',')
        .map((value) => value.trim()),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ));
}

async function fetchAppleKeys(forceRefresh = false): Promise<AppleSigningKey[]> {
  const now = Date.now();
  if (!forceRefresh && cachedKeys && now - cachedKeys.fetchedAt < 6 * 60 * 60 * 1000) {
    return cachedKeys.keys;
  }

  const response = await fetch('https://appleid.apple.com/auth/keys', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Apple key fetch failed with status ${response.status}`);
  }

  const payload = await response.json() as AppleKeysResponse;
  const keys = Array.isArray(payload.keys) ? payload.keys.filter((key) => key?.kty === 'RSA' && key?.kid) : [];
  if (keys.length === 0) {
    throw new Error('Apple sign-in keys are unavailable.');
  }

  cachedKeys = {
    fetchedAt: now,
    keys,
  };
  return keys;
}

function normalizeAppleEmailVerified(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizeApplePrivateEmail(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return String(value || '').trim().toLowerCase() === 'true';
}

export class AppleAuthService {
  async verifyIdentityToken(identityToken: string): Promise<VerifiedAppleIdentity> {
    const normalizedToken = String(identityToken || '').trim();
    if (!normalizedToken) {
      throw new Error('Apple identity token is required.');
    }

    const audiences = resolveAppleAudiences();
    if (audiences.length === 0) {
      throw new Error('Apple sign-in is not configured on the server.');
    }

    const decoded = jwt.decode(normalizedToken, { complete: true }) as { header?: { kid?: string; alg?: string } } | null;
    const header = decoded?.header || {};
    const keyId = String(header.kid || '').trim();
    const algorithm = String(header.alg || '').trim();
    if (!keyId || algorithm !== 'RS256') {
      throw new Error('Apple identity token has an unsupported signature.');
    }

    let keys = await fetchAppleKeys();
    let signingKey = keys.find((candidate) => candidate.kid === keyId);
    if (!signingKey) {
      keys = await fetchAppleKeys(true);
      signingKey = keys.find((candidate) => candidate.kid === keyId);
    }
    if (!signingKey) {
      throw new Error('Apple identity token key was not found.');
    }

    const publicKey = crypto.createPublicKey({
      key: signingKey,
      format: 'jwk',
    });
    const audience = audiences.length === 1
      ? audiences[0]
      : audiences as [string, ...string[]];

    const payload = jwt.verify(normalizedToken, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience,
    }) as jwt.JwtPayload;

    const sub = String(payload.sub || '').trim();
    const email = String(payload.email || '').trim().toLowerCase() || null;
    if (!sub) {
      throw new Error('Apple identity token is missing account information.');
    }

    return {
      sub,
      email,
      emailVerified: normalizeAppleEmailVerified(payload.email_verified),
      isPrivateEmail: normalizeApplePrivateEmail(payload.is_private_email),
    };
  }
}

export const appleAuthService = new AppleAuthService();
