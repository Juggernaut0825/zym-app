import { OAuth2Client } from 'google-auth-library';

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

let googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    googleClient = new OAuth2Client();
  }
  return googleClient;
}

function resolveGoogleAudiences(): string[] {
  return Array.from(new Set(
    [
      process.env.GOOGLE_CLIENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      ...(String(process.env.GOOGLE_CLIENT_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ));
}

export class GoogleAuthService {
  async verifyIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
    const normalizedToken = String(idToken || '').trim();
    if (!normalizedToken) {
      throw new Error('Google credential is required.');
    }

    const audiences = resolveGoogleAudiences();
    if (audiences.length === 0) {
      throw new Error('Google sign-in is not configured on the server.');
    }

    const ticket = await getGoogleClient().verifyIdToken({
      idToken: normalizedToken,
      audience: audiences,
    });
    const payload = ticket.getPayload();
    const email = String(payload?.email || '').trim().toLowerCase();
    const sub = String(payload?.sub || '').trim();

    if (!sub || !email) {
      throw new Error('Google credential is missing account information.');
    }

    return {
      sub,
      email,
      emailVerified: Boolean(payload?.email_verified),
      name: String(payload?.name || '').trim() || null,
    };
  }
}

export const googleAuthService = new GoogleAuthService();
