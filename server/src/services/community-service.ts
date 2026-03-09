import { getDB } from '../database/sqlite-db.js';

function parseMediaUrls(mediaUrls: unknown): string[] {
  if (typeof mediaUrls !== 'string' || !mediaUrls) return [];
  try {
    const parsed = JSON.parse(mediaUrls);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export class CommunityService {
  static createPost(userId: number, type: string, content: string, mediaUrls: string[] = []) {
    const result = getDB().prepare('INSERT INTO posts (user_id, type, content, media_urls) VALUES (?, ?, ?, ?)').run(
      userId,
      type,
      content,
      mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
    );
    return Number(result.lastInsertRowid);
  }

  static getFeed(userId: number) {
    const posts = getDB().prepare(`
      SELECT p.*, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id) as reaction_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
        OR p.user_id IN (
          SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
          UNION
          SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'accepted'
        )
      ORDER BY p.created_at DESC
      LIMIT 60
    `).all(userId, userId, userId) as any[];

    return posts.map((post) => ({
      ...post,
      media_urls: parseMediaUrls(post.media_urls),
    }));
  }

  static reactToPost(postId: number, userId: number, reactionType: string) {
    getDB().prepare('INSERT OR REPLACE INTO post_reactions (post_id, user_id, reaction_type) VALUES (?, ?, ?)').run(
      postId,
      userId,
      reactionType,
    );
  }

  static addFriend(userId: number, friendId: number) {
    getDB().prepare('INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)').run(userId, friendId, 'pending');
  }

  static acceptFriend(userId: number, friendId: number) {
    getDB().prepare('UPDATE friendships SET status = ? WHERE user_id = ? AND friend_id = ?').run('accepted', friendId, userId);
  }
}
