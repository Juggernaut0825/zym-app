import { getDB } from '../database/runtime-db.js';

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
    db.prepare("UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ?").run(friendId, userId);
  }

  static async getFriends(userId: string) {
    const db = getDB();
    return db.prepare(`
      SELECT DISTINCT u.id, u.username, u.avatar_url
      FROM users u
      JOIN friendships f
        ON (
          (f.user_id = ? AND f.friend_id = u.id)
          OR (f.friend_id = ? AND f.user_id = u.id)
        )
      WHERE f.status = 'accepted'
      ORDER BY u.username ASC
    `).all(userId, userId);
  }

  static async getPendingRequests(userId: string) {
    const db = getDB();
    return db.prepare(`
      SELECT u.id, u.username, u.avatar_url
      FROM users u
      JOIN friendships f ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(userId);
  }
}
