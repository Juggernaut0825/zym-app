import { getDB } from '../database/sqlite-db.js';

export type AbuseTargetType = 'user' | 'post' | 'message' | 'group';

export interface AbuseReport {
  id: number;
  reporter_user_id: number;
  target_type: AbuseTargetType;
  target_id: number;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

export class ModerationService {
  static createReport(
    reporterUserId: number,
    targetType: AbuseTargetType,
    targetId: number,
    reason: string,
    details?: string,
  ): number {
    const db = getDB();
    if (!this.targetExists(targetType, targetId)) {
      throw new Error('Report target not found');
    }

    const normalizedReason = String(reason || '').trim().slice(0, 80);
    const normalizedDetails = String(details || '').trim().slice(0, 1200);
    if (!normalizedReason) {
      throw new Error('reason is required');
    }

    const dedupe = db.prepare(`
      SELECT id
      FROM abuse_reports
      WHERE reporter_user_id = ?
        AND target_type = ?
        AND target_id = ?
        AND reason = ?
        AND status = 'open'
        AND datetime(created_at) >= datetime('now', '-1 hour')
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `).get(reporterUserId, targetType, targetId, normalizedReason) as { id?: number } | undefined;
    if (Number.isInteger(dedupe?.id) && Number(dedupe?.id) > 0) {
      return Number(dedupe?.id);
    }

    const result = db.prepare(`
      INSERT INTO abuse_reports (reporter_user_id, target_type, target_id, reason, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      reporterUserId,
      targetType,
      targetId,
      normalizedReason,
      normalizedDetails || null,
    );

    return Number(result.lastInsertRowid);
  }

  static getReportsForUser(userId: number, limit = 50): AbuseReport[] {
    return getDB().prepare(`
      SELECT id, reporter_user_id, target_type, target_id, reason, details, status, created_at
      FROM abuse_reports
      WHERE reporter_user_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `).all(userId, limit) as AbuseReport[];
  }

  private static targetExists(targetType: AbuseTargetType, targetId: number): boolean {
    const db = getDB();
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return false;
    }

    if (targetType === 'user') {
      return Boolean(db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId));
    }
    if (targetType === 'post') {
      return Boolean(db.prepare('SELECT 1 FROM posts WHERE id = ?').get(targetId));
    }
    if (targetType === 'message') {
      return Boolean(db.prepare('SELECT 1 FROM messages WHERE id = ?').get(targetId));
    }
    if (targetType === 'group') {
      return Boolean(db.prepare('SELECT 1 FROM groups WHERE id = ?').get(targetId));
    }
    return false;
  }
}
