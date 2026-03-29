import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface AdminTokenPayload {
  typ: 'admin_dashboard';
  usr: string;
}

function safeString(value: unknown, maxLength = 160): string {
  return String(value || '').trim().slice(0, maxLength);
}

function getAdminUsername(): string {
  return safeString(process.env.ADMIN_DASHBOARD_USERNAME || 'admin', 80) || 'admin';
}

function getAdminPassword(): string {
  return safeString(process.env.ADMIN_DASHBOARD_PASSWORD || '', 200);
}

function getAdminJwtSecret(): string {
  return safeString(process.env.ADMIN_DASHBOARD_JWT_SECRET || process.env.JWT_SECRET || '', 500);
}

function timingSafeMatch(left: string, right: string): boolean {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createExpiryIso(hours = 12): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export class AdminAuthService {
  static isConfigured(): boolean {
    return Boolean(getAdminPassword() && getAdminJwtSecret());
  }

  static getPublicConfig() {
    return {
      configured: this.isConfigured(),
      username: getAdminUsername(),
    };
  }

  static login(username: string, password: string): { token: string; username: string; expiresAt: string } | null {
    if (!this.isConfigured()) {
      return null;
    }

    const expectedUsername = getAdminUsername();
    const expectedPassword = getAdminPassword();
    const normalizedUsername = safeString(username, 80);
    const normalizedPassword = safeString(password, 200);

    if (!timingSafeMatch(normalizedUsername, expectedUsername) || !timingSafeMatch(normalizedPassword, expectedPassword)) {
      return null;
    }

    const expiresAt = createExpiryIso();
    const token = jwt.sign(
      {
        typ: 'admin_dashboard',
        usr: expectedUsername,
      } satisfies AdminTokenPayload,
      getAdminJwtSecret(),
      { expiresIn: '12h' },
    );

    return {
      token,
      username: expectedUsername,
      expiresAt,
    };
  }

  static verify(token: string): { username: string } | null {
    try {
      const payload = jwt.verify(safeString(token, 2000), getAdminJwtSecret()) as AdminTokenPayload;
      if (payload?.typ !== 'admin_dashboard') {
        return null;
      }
      const username = safeString(payload?.usr, 80);
      if (!username || username !== getAdminUsername()) {
        return null;
      }
      return { username };
    } catch {
      return null;
    }
  }
}
