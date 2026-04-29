import { getDB } from '../database/runtime-db.js';

export type FriendshipRelationshipStatus =
  | 'self'
  | 'none'
  | 'accepted'
  | 'outgoing_pending'
  | 'incoming_pending';

export class FriendService {
  static async addFriend(userId: string, friendId: string) {
    const db = getDB();
    if (userId === friendId) {
      throw new Error('Cannot add yourself');
    }

    const existing = db.prepare(
      'SELECT id FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    ).get(userId, friendId, friendId, userId);

    if (existing) {
      throw new Error('Friend request already exists');
    }

    db.prepare("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')").run(userId, friendId);
  }

  static async acceptFriend(userId: string, friendId: string) {
    const db = getDB();
    const result = db
      .prepare("UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ? AND status = 'pending'")
      .run(friendId, userId);
    if (!Number(result.changes || 0)) {
      throw new Error('Friend request not found');
    }
  }

  static getAcceptedFriendIds(userId: number): number[] {
    const safeUserId = Number(userId);
    if (!Number.isInteger(safeUserId) || safeUserId <= 0) return [];

    return getDB().prepare(`
      SELECT DISTINCT CASE
        WHEN user_id = ? THEN friend_id
        ELSE user_id
      END AS friend_id
      FROM friendships
      WHERE status = 'accepted'
        AND (user_id = ? OR friend_id = ?)
    `).all(safeUserId, safeUserId, safeUserId)
      .map((row: any) => Number(row.friend_id || 0))
      .filter((value: number) => Number.isInteger(value) && value > 0 && value !== safeUserId);
  }

  static async getFriends(userId: string) {
    const db = getDB();
    return db.prepare(`
      SELECT DISTINCT u.id,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS username,
        u.username AS account_username,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS display_name,
        u.avatar_url
      FROM users u
      JOIN friendships f
        ON (
          (f.user_id = ? AND f.friend_id = u.id)
          OR (f.friend_id = ? AND f.user_id = u.id)
        )
      WHERE f.status = 'accepted'
      ORDER BY display_name ASC, u.username ASC
    `).all(userId, userId);
  }

  static async getPendingRequests(userId: string) {
    const db = getDB();
    return db.prepare(`
      SELECT u.id,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS username,
        u.username AS account_username,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS display_name,
        u.avatar_url
      FROM users u
      JOIN friendships f ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(userId);
  }

  static getRelationshipStatus(viewerUserId: number, targetUserId: number): FriendshipRelationshipStatus {
    const viewerId = Number(viewerUserId);
    const targetId = Number(targetUserId);
    if (!Number.isInteger(viewerId) || viewerId <= 0 || !Number.isInteger(targetId) || targetId <= 0) {
      return 'none';
    }
    if (viewerId == targetId) {
      return 'self';
    }

    const relation = getDB().prepare(`
      SELECT user_id, friend_id, status
      FROM friendships
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      ORDER BY id DESC
      LIMIT 1
    `).get(viewerId, targetId, targetId, viewerId) as {
      user_id?: number;
      friend_id?: number;
      status?: string;
    } | undefined;

    const status = String(relation?.status || '').trim().toLowerCase();
    if (status === 'accepted') {
      return 'accepted';
    }
    if (status === 'pending') {
      return Number(relation?.user_id) === viewerId ? 'outgoing_pending' : 'incoming_pending';
    }
    return 'none';
  }
}
