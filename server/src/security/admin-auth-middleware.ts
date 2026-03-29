import { NextFunction, Request, Response } from 'express';
import { AdminAuthService } from '../services/admin-auth-service.js';

declare global {
  namespace Express {
    interface Request {
      adminUsername?: string;
    }
  }
}

function extractBearerToken(req: Request): string {
  const header = String(req.headers.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim().slice(0, 4000);
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing admin bearer token' });
  }

  const verified = AdminAuthService.verify(token);
  if (!verified) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }

  req.adminUsername = verified.username;
  next();
}
