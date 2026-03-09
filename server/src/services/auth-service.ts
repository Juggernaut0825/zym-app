import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDB } from '../database/sqlite-db.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set; using ephemeral secret for this runtime. Set JWT_SECRET in production.');
}

export class AuthService {
  static async register(username: string, email: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    const result = getDB().prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, hash);
    return result.lastInsertRowid;
  }

  static async login(username: string, password: string) {
    const user = getDB().prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as any;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
    return { userId: user.id, token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' }) };
  }

  static verifyToken(token: string): { userId: string } | null {
    try {
      return jwt.verify(token, JWT_SECRET) as { userId: string };
    } catch {
      return null;
    }
  }

  static createFriendConnectToken(userId: number, ttlSeconds = 60): string {
    return jwt.sign(
      {
        typ: 'friend_connect',
        uid: userId,
      },
      JWT_SECRET,
      { expiresIn: `${Math.max(10, ttlSeconds)}s` },
    );
  }

  static verifyFriendConnectToken(token: string): number | null {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { typ?: string; uid?: number | string };
      if (payload.typ !== 'friend_connect') return null;
      const userId = Number(payload.uid);
      if (!Number.isInteger(userId) || userId <= 0) return null;
      return userId;
    } catch {
      return null;
    }
  }
}
