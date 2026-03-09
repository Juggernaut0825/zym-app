import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth-service.js';

declare global {
  namespace Express {
    interface Request {
      authUserId?: number;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = Number(payload.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Invalid auth payload' });
  }

  req.authUserId = userId;
  next();
}

export function requireSameUserIdFromBody(key = 'userId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const authUserId = req.authUserId;
    const bodyUserId = Number((req.body || {})[key]);

    if (!authUserId || !Number.isInteger(bodyUserId) || bodyUserId !== authUserId) {
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
      return res.status(403).json({ error: 'Forbidden user scope' });
    }

    next();
  };
}
