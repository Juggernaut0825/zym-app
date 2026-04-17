import { getDB } from '../database/runtime-db.js';

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
  static createPost(
    userId: number,
    type: string,
    content: string,
    mediaUrls: string[] = [],
    visibility: 'private' | 'friends' | 'public' = 'friends',
    location?: {
      label: string;
      city: string;
      latitude: number;
      longitude: number;
      precision: 'city' | 'precise';
    } | null,
  ) {
    const result = getDB().prepare(`
      INSERT INTO posts (
        user_id,
        type,
        visibility,
        content,
        media_urls,
        location_label,
        location_city,
        location_latitude,
        location_longitude,
        location_precision
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      type,
      visibility,
      content,
      mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
      location?.label || null,
      location?.city || null,
      location?.latitude ?? null,
      location?.longitude ?? null,
      location?.precision || null,
    );
    return Number(result.lastInsertRowid);
  }

  static getFeed(userId: number) {
    const posts = getDB().prepare(`
      SELECT p.*, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id) as reaction_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM post_reactions pr
            WHERE pr.post_id = p.id
              AND pr.user_id = ?
          ) THEN 1
          ELSE 0
        END as viewer_has_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.visibility = 'public'
         OR p.user_id = ?
         OR (
           p.visibility = 'friends'
           AND p.user_id IN (
             SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
             UNION
             SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'accepted'
           )
         )
      ORDER BY p.created_at DESC
      LIMIT 60
    `).all(userId, userId, userId, userId) as any[];

    return posts.map((post) => ({
      ...post,
      media_urls: parseMediaUrls(post.media_urls),
      viewer_has_liked: Number(post.viewer_has_liked || 0) === 1,
      location_label: post.location_label || null,
      location_city: post.location_city || null,
      location_latitude: Number.isFinite(Number(post.location_latitude)) ? Number(post.location_latitude) : null,
      location_longitude: Number.isFinite(Number(post.location_longitude)) ? Number(post.location_longitude) : null,
      location_precision: post.location_precision || null,
    }));
  }

  static togglePostReaction(postId: number, userId: number, reactionType: string) {
    const existing = getDB()
      .prepare('SELECT id FROM post_reactions WHERE post_id = ? AND user_id = ?')
      .get(postId, userId) as { id?: number } | undefined;

    if (existing?.id) {
      getDB()
        .prepare('DELETE FROM post_reactions WHERE id = ?')
        .run(existing.id);
      return {
        reacted: false,
        reactionId: null,
        reactionCount: this.getReactionCount(postId),
      };
    }

    const result = getDB()
      .prepare('INSERT INTO post_reactions (post_id, user_id, reaction_type) VALUES (?, ?, ?)')
      .run(
        postId,
        userId,
        reactionType,
      );

    return {
      reacted: true,
      reactionId: Number(result.lastInsertRowid),
      reactionCount: this.getReactionCount(postId),
    };
  }

  static getReactionCount(postId: number): number {
    const row = getDB()
      .prepare('SELECT COUNT(*) as count FROM post_reactions WHERE post_id = ?')
      .get(postId) as { count?: number } | undefined;
    return Number(row?.count || 0);
  }

  static addComment(postId: number, userId: number, content: string) {
    const result = getDB()
      .prepare('INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)')
      .run(postId, userId, content);
    return Number(result.lastInsertRowid);
  }

  static getComments(postId: number) {
    return getDB()
      .prepare(`
        SELECT pc.id, pc.post_id, pc.user_id, pc.content, pc.created_at, u.username, u.avatar_url
        FROM post_comments pc
        JOIN users u ON u.id = pc.user_id
        WHERE pc.post_id = ?
        ORDER BY datetime(pc.created_at) ASC
      `)
      .all(postId)
      .map((row: any) => ({
        id: Number(row.id),
        post_id: Number(row.post_id),
        user_id: Number(row.user_id),
        username: String(row.username || ''),
        avatar_url: row.avatar_url || null,
        content: String(row.content || ''),
        created_at: String(row.created_at || ''),
      }));
  }

  static getPostById(postId: number) {
    return getDB()
      .prepare(`
        SELECT id, user_id, visibility, location_label, location_city, location_latitude, location_longitude, location_precision
        FROM posts
        WHERE id = ?
      `)
      .get(postId) as {
        id?: number;
        user_id?: number;
        visibility?: string;
        location_label?: string | null;
        location_city?: string | null;
        location_latitude?: number | null;
        location_longitude?: number | null;
        location_precision?: string | null;
      } | undefined;
  }

  static updatePostVisibility(postId: number, userId: number, visibility: 'private' | 'friends' | 'public') {
    const post = this.getPostById(postId);
    if (!post?.id) {
      throw new Error('Post not found.');
    }
    if (Number(post.user_id) !== userId) {
      throw new Error('You can only update your own posts.');
    }

    getDB()
      .prepare('UPDATE posts SET visibility = ? WHERE id = ?')
      .run(visibility, postId);
  }

  static deletePost(postId: number, userId: number) {
    const post = this.getPostById(postId);
    if (!post?.id) {
      throw new Error('Post not found.');
    }
    if (Number(post.user_id) !== userId) {
      throw new Error('You can only delete your own posts.');
    }

    const commentIds = getDB()
      .prepare('SELECT id FROM post_comments WHERE post_id = ?')
      .all(postId) as Array<{ id?: number }>;

    getDB().prepare('DELETE FROM post_reactions WHERE post_id = ?').run(postId);
    getDB().prepare('DELETE FROM post_comments WHERE post_id = ?').run(postId);

    if (commentIds.length > 0) {
      const deleteMentionByCommentId = getDB()
        .prepare('DELETE FROM mention_notifications WHERE source_type = ? AND source_id = ?');
      for (const comment of commentIds) {
        if (comment.id) {
          deleteMentionByCommentId.run('post_comment', Number(comment.id));
        }
      }
    }

    getDB().prepare('DELETE FROM posts WHERE id = ?').run(postId);
  }

  static canAccessPost(viewerUserId: number, postId: number): boolean {
    const post = getDB()
      .prepare('SELECT user_id, visibility FROM posts WHERE id = ?')
      .get(postId) as { user_id?: number; visibility?: string } | undefined;
    if (!post?.user_id) return false;

    const visibility = post.visibility === 'public' || post.visibility === 'private' ? post.visibility : 'friends';

    if (visibility === 'public') return true;

    if (Number(post.user_id) === viewerUserId) return true;
    if (visibility === 'private') return false;

    const relation = getDB()
      .prepare(`
        SELECT 1
        FROM friendships
        WHERE status = 'accepted'
          AND (
            (user_id = ? AND friend_id = ?)
            OR (user_id = ? AND friend_id = ?)
          )
        LIMIT 1
      `)
      .get(viewerUserId, Number(post.user_id), Number(post.user_id), viewerUserId);
    return Boolean(relation);
  }

  static addFriend(userId: number, friendId: number) {
    getDB().prepare('INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)').run(userId, friendId, 'pending');
  }

  static acceptFriend(userId: number, friendId: number) {
    getDB().prepare('UPDATE friendships SET status = ? WHERE user_id = ? AND friend_id = ?').run('accepted', friendId, userId);
  }
}
