import { Request, Response, NextFunction } from 'express';

export class APIGateway {
  private static rateLimits = new Map<string, number[]>();

  static rateLimit(maxRequests: number, windowMs: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = req.ip || 'unknown';
      const now = Date.now();
      const requests = this.rateLimits.get(key) || [];
      const recentRequests = requests.filter(t => now - t < windowMs);
      
      if (recentRequests.length >= maxRequests) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      
      recentRequests.push(now);
      this.rateLimits.set(key, recentRequests);
      next();
    };
  }

  static validateSchema(schema: any) {
    return (req: Request, res: Response, next: NextFunction) => {
      // Basic schema validation
      for (const key in schema) {
        if (schema[key].required && !req.body[key]) {
          return res.status(400).json({ error: `Missing ${key}` });
        }
      }
      next();
    };
  }
}
