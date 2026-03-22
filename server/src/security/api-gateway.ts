import { Request, Response, NextFunction } from 'express';
import { getRateLimiter } from './rate-limiter.js';

type PrimitiveType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface SchemaRule {
  required?: boolean;
  type?: PrimitiveType;
  integer?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: Array<string | number | boolean>;
  maxItems?: number;
  itemType?: Exclude<PrimitiveType, 'array'>;
  maxItemLength?: number;
}

export type SchemaDefinition = Record<string, SchemaRule>;

function isMissing(value: unknown): boolean {
  return value === undefined || value === null;
}

function matchesType(value: unknown, type: PrimitiveType): boolean {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === type;
}

export class APIGateway {
  private static buildRateLimitKey(req: Request, scope: string): string {
    const authUserId = Number((req as Request & { authUserId?: number }).authUserId || 0);
    if (Number.isInteger(authUserId) && authUserId > 0) {
      return `${scope}:uid:${authUserId}`;
    }

    const forwarded = req.headers['x-forwarded-for'];
    const rawIp = Array.isArray(forwarded)
      ? String(forwarded[0] || '')
      : String(forwarded || req.ip || 'unknown');
    const normalizedIp = rawIp.split(',')[0].trim() || 'unknown';
    return `${scope}:ip:${normalizedIp}`;
  }

  static rateLimit(maxRequests: number, windowMs: number, scope = 'global') {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.buildRateLimitKey(req, scope);
      void getRateLimiter()
        .then((limiter) => limiter.consume(key, maxRequests, windowMs))
        .then((decision) => {
          res.setHeader('X-RateLimit-Limit', String(maxRequests));
          res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
          res.setHeader('X-RateLimit-Provider', decision.provider);
          res.setHeader('X-RateLimit-Reset', new Date(Date.now() + decision.retryAfterSeconds * 1000).toISOString());

          if (!decision.allowed) {
            res.setHeader('Retry-After', String(decision.retryAfterSeconds));
            res.status(429).json({
              error: 'Too many requests',
              scope,
              retryAfterSeconds: decision.retryAfterSeconds,
            });
            return;
          }

          next();
        })
        .catch((error) => {
          next(error);
        });
    };
  }

  static validateSchema(schema: SchemaDefinition) {
    return (req: Request, res: Response, next: NextFunction) => {
      const body = req.body || {};

      for (const [key, rule] of Object.entries(schema)) {
        const value = body[key];

        if (isMissing(value)) {
          if (rule.required) {
            return res.status(400).json({ error: `Missing ${key}` });
          }
          continue;
        }

        if (rule.type && !matchesType(value, rule.type)) {
          return res.status(400).json({ error: `Invalid ${key} type` });
        }

        if (rule.enum && !rule.enum.includes(value as any)) {
          return res.status(400).json({ error: `Invalid ${key} value` });
        }

        if (rule.type === 'number') {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) {
            return res.status(400).json({ error: `Invalid ${key}` });
          }
          if (rule.integer && !Number.isInteger(numeric)) {
            return res.status(400).json({ error: `${key} must be an integer` });
          }
          if (rule.min !== undefined && numeric < rule.min) {
            return res.status(400).json({ error: `${key} is below minimum` });
          }
          if (rule.max !== undefined && numeric > rule.max) {
            return res.status(400).json({ error: `${key} exceeds maximum` });
          }
        }

        if (rule.type === 'string') {
          const text = String(value);
          if (rule.minLength !== undefined && text.length < rule.minLength) {
            return res.status(400).json({ error: `${key} is too short` });
          }
          if (rule.maxLength !== undefined && text.length > rule.maxLength) {
            return res.status(400).json({ error: `${key} is too long` });
          }
          if (rule.pattern && !rule.pattern.test(text)) {
            return res.status(400).json({ error: `Invalid ${key} format` });
          }
        }

        if (rule.type === 'array') {
          const arr = value as unknown[];
          if (rule.maxItems !== undefined && arr.length > rule.maxItems) {
            return res.status(400).json({ error: `${key} exceeds max items` });
          }
          if (rule.itemType) {
            const hasInvalidItem = arr.some(item => !matchesType(item, rule.itemType!));
            if (hasInvalidItem) {
              return res.status(400).json({ error: `Invalid ${key} items` });
            }
          }
          if (rule.itemType === 'string' && rule.maxItemLength !== undefined) {
            const tooLong = arr.some(item => String(item).length > rule.maxItemLength!);
            if (tooLong) {
              return res.status(400).json({ error: `${key} item is too long` });
            }
          }
        }
      }

      next();
    };
  }
}
