import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth-service.js';
import { SecurityEventService } from '../services/security-event-service.js';

declare global {
  namespace Express {
    interface Request {
      authUserId?: number;
      authSessionId?: string;
      authToken?: string;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  const normalized = token.trim();
  if (normalized.length === 0 || normalized.length > 4096) return null;
  return normalized;
}

function requestIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) {
    return String(forwarded[0] || '').split(',')[0].trim().slice(0, 80);
  }
  return String(forwarded || req.ip || '').split(',')[0].trim().slice(0, 80);
}

function requestUserAgent(req: Request): string {
  return String(req.headers['user-agent'] || '').trim().slice(0, 300);
}

function auditAuthIssue(req: Request, eventType: string, metadata?: Record<string, unknown>) {
  try {
    SecurityEventService.create({
      eventType,
      severity: 'warn',
      ipAddress: requestIp(req),
      userAgent: requestUserAgent(req),
      metadata: {
        path: req.originalUrl,
        method: req.method,
        ...(metadata || {}),
      },
    });
  } catch {
    // Keep auth middleware non-blocking on audit failures.
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    auditAuthIssue(req, 'auth_missing_bearer');
    return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    auditAuthIssue(req, 'auth_invalid_or_expired_token');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = Number(payload.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    auditAuthIssue(req, 'auth_invalid_payload');
    return res.status(401).json({ error: 'Invalid auth payload' });
  }

  req.authUserId = userId;
  req.authSessionId = payload.sid;
  req.authToken = token;
  next();
}

export function requireSameUserIdFromBody(key = 'userId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const authUserId = req.authUserId;
    const bodyUserId = Number((req.body || {})[key]);

    if (!authUserId || !Number.isInteger(bodyUserId) || bodyUserId !== authUserId) {
      auditAuthIssue(req, 'auth_scope_violation_body', {
        key,
        authUserId: authUserId || null,
        providedUserId: Number.isInteger(bodyUserId) ? bodyUserId : null,
      });
      return res.status(403).json({ error: 'Forbidden user scope' });
    }

    next();
  };
}

export function requireSameUserIdFromParam(key = 'userId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const authUserId = req.authUserId;
    const paramUserId = Number((req.params || {})[key]);

    if (!authUserId || !Number.isInteger(paramUserId) || paramUserId !== authUserId) {
      auditAuthIssue(req, 'auth_scope_violation_param', {
        key,
        authUserId: authUserId || null,
        providedUserId: Number.isInteger(paramUserId) ? paramUserId : null,
      });
      return res.status(403).json({ error: 'Forbidden user scope' });
    }

    next();
  };
}
