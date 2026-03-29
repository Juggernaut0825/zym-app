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
  ) {
    const result = getDB().prepare('INSERT INTO posts (user_id, type, visibility, content, media_urls) VALUES (?, ?, ?, ?, ?)').run(
      userId,
      type,
      visibility,
      content,
      mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
    );
    return Number(result.lastInsertRowid);
  }

  static getFeed(userId: number) {
    const posts = getDB().prepare(`
      SELECT p.*, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.id) as reaction_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count
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
      .prepare('SELECT id, user_id, visibility FROM posts WHERE id = ?')
      .get(postId) as { id?: number; user_id?: number; visibility?: string } | undefined;
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
