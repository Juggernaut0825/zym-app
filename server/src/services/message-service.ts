import { getDB } from '../database/runtime-db.js';
import { stripCoachMentions } from '../utils/coach-mention.js';

export interface ParsedMessage {
  id: number;
  topic: string;
  from_user_id: number;
  content: string | null;
  media_urls: string[];
  mentions: string[];
  reply_to: number | null;
  created_at: string;
  username: string;
  avatar_url: string | null;
  is_coach: boolean;
}

export interface MentionNotification {
  id: number;
  topic: string | null;
  message_id: number | null;
  source_type: 'message' | 'post_comment';
  source_id: number;
  snippet: string;
  is_read: boolean;
  created_at: string;
  actor_user_id: number | null;
  actor_username: string | null;
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
  } catch {
    return [];
  }
}

function parseP2PTopic(topic: string): { userA: number; userB: number } | null {
  if (!topic.startsWith('p2p_')) return null;
  const parts = topic.split('_');
  if (parts.length !== 3) return null;

  const userA = Number(parts[1]);
  const userB = Number(parts[2]);
  if (!Number.isInteger(userA) || !Number.isInteger(userB)) return null;

  return { userA, userB };
}

function parseCoachTopic(topic: string): { userId: number } | null {
  if (!topic.startsWith('coach_')) return null;
  const userId = Number(topic.replace('coach_', ''));
  if (!Number.isInteger(userId)) return null;
  return { userId };
}

function parseGroupTopic(topic: string): { groupId: number } | null {
  if (!topic.startsWith('grp_')) return null;
  const groupId = Number(topic.replace('grp_', ''));
  if (!Number.isInteger(groupId)) return null;
  return { groupId };
}

function uniqueLower(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function normalizeTimestamp(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw}Z`
      : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

export function buildP2PTopic(userIdA: number, userIdB: number): string {
  const [a, b] = [userIdA, userIdB].sort((x, y) => x - y);
  return `p2p_${a}_${b}`;
}

export class MessageService {
  static async canAccessTopic(userId: number, topic: string): Promise<boolean> {
    const coach = parseCoachTopic(topic);
    if (coach) {
      return coach.userId === userId;
    }

    const p2p = parseP2PTopic(topic);
    if (p2p) {
      return p2p.userA === userId || p2p.userB === userId;
    }

    const group = parseGroupTopic(topic);
    if (group) {
      const member = getDB()
        .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
        .get(group.groupId, userId);
      return Boolean(member);
    }

    return false;
  }

  static async getTopicParticipants(topic: string): Promise<number[]> {
    const coach = parseCoachTopic(topic);
    if (coach) {
      return [coach.userId];
    }

    const p2p = parseP2PTopic(topic);
    if (p2p) {
      return [p2p.userA, p2p.userB];
    }

    const group = parseGroupTopic(topic);
    if (group) {
      return getDB()
        .prepare('SELECT user_id FROM group_members WHERE group_id = ?')
        .all(group.groupId)
        .map((item: any) => Number(item.user_id));
    }

    return [];
  }

  static async getInbox(userId: string) {
    const db = getDB();
    const currentUserId = Number(userId);
    const unreadCountStmt = db.prepare(`
      SELECT COUNT(1) AS count
      FROM messages
      WHERE topic = ?
        AND id > COALESCE((SELECT last_read_message_id FROM message_reads WHERE user_id = ? AND topic = ?), 0)
        AND from_user_id != ?
    `);
    const unreadMentionStmt = db.prepare(`
      SELECT COUNT(1) AS count
      FROM mention_notifications
      WHERE user_id = ? AND topic = ? AND is_read = 0
    `);

    const p2pTopics = db.prepare(`
      SELECT topic, MAX(created_at) as last_message_at
      FROM messages
      WHERE topic LIKE 'p2p_%'
      GROUP BY topic
      ORDER BY last_message_at DESC
    `).all() as Array<{ topic: string; last_message_at: string }>;

    const dms = p2pTopics
      .map(item => {
        const parsed = parseP2PTopic(item.topic);
        if (!parsed) return null;
        if (parsed.userA !== currentUserId && parsed.userB !== currentUserId) return null;

        const otherUserId = parsed.userA === currentUserId ? parsed.userB : parsed.userA;
        const user = db.prepare('SELECT id, username, avatar_url FROM users WHERE id = ?').get(otherUserId) as any;
        const preview = db.prepare('SELECT content FROM messages WHERE topic = ? ORDER BY created_at DESC LIMIT 1').get(item.topic) as any;
        const unreadRow = unreadCountStmt.get(item.topic, currentUserId, item.topic, currentUserId) as { count?: number } | undefined;
        const mentionRow = unreadMentionStmt.get(currentUserId, item.topic) as { count?: number } | undefined;

        return {
          topic: item.topic,
          other_user_id: String(otherUserId),
          username: user?.username || `User ${otherUserId}`,
          avatar_url: user?.avatar_url || null,
          last_message_at: normalizeTimestamp(item.last_message_at),
          last_message_preview: preview?.content || '',
          unread_count: Number(unreadRow?.count || 0),
          mention_count: Number(mentionRow?.count || 0),
        };
      })
      .filter(Boolean);

    const groups = db.prepare(`
      SELECT g.id, g.name, g.coach_enabled, MAX(m.created_at) AS last_message_at
      FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      LEFT JOIN messages m ON m.topic = 'grp_' || g.id
      WHERE gm.user_id = ?
      GROUP BY g.id
      ORDER BY last_message_at DESC
    `).all(currentUserId).map((group: any) => {
      const topic = `grp_${group.id}`;
      const preview = db.prepare('SELECT content FROM messages WHERE topic = ? ORDER BY created_at DESC LIMIT 1').get(topic) as any;
      const unreadRow = unreadCountStmt.get(topic, currentUserId, topic, currentUserId) as { count?: number } | undefined;
      const mentionRow = unreadMentionStmt.get(currentUserId, topic) as { count?: number } | undefined;
      return {
        id: group.id,
        topic,
        name: group.name,
        coach_enabled: group.coach_enabled,
        last_message_at: normalizeTimestamp(group.last_message_at) || null,
        last_message_preview: preview?.content || '',
        unread_count: Number(unreadRow?.count || 0),
        mention_count: Number(mentionRow?.count || 0),
      };
    });

    const coachTopic = `coach_${currentUserId}`;
    const coachLast = db.prepare('SELECT MAX(created_at) as last_message_at FROM messages WHERE topic = ?').get(coachTopic) as any;
    const coachPreview = db.prepare('SELECT content FROM messages WHERE topic = ? ORDER BY created_at DESC LIMIT 1').get(coachTopic) as any;
    const coachUnread = unreadCountStmt.get(coachTopic, currentUserId, coachTopic, currentUserId) as { count?: number } | undefined;
    const coachMentions = unreadMentionStmt.get(currentUserId, coachTopic) as { count?: number } | undefined;

    return {
      coach: {
        topic: coachTopic,
        last_message_at: normalizeTimestamp(coachLast?.last_message_at) || null,
        last_message_preview: coachPreview?.content || '',
        unread_count: Number(coachUnread?.count || 0),
        mention_count: Number(coachMentions?.count || 0),
      },
      dms,
      groups,
    };
  }

  static async getMessages(topic: string, limit = 80): Promise<ParsedMessage[]> {
    const db = getDB();
    const rows = db.prepare(`
      SELECT m.*, u.username, u.avatar_url
      FROM messages m
      LEFT JOIN users u ON u.id = m.from_user_id
      WHERE m.topic = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(topic, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      topic: row.topic,
      from_user_id: Number(row.from_user_id),
      content: row.content || null,
      media_urls: parseJsonArray(row.media_urls),
      mentions: parseJsonArray(row.mentions),
      reply_to: row.reply_to || null,
      created_at: normalizeTimestamp(row.created_at) || String(row.created_at || ''),
      username: row.from_user_id === 0 ? 'Coach' : (row.username || `User ${row.from_user_id}`),
      avatar_url: row.avatar_url || null,
      is_coach: Number(row.from_user_id) === 0,
    }));
  }

  static async sendMessage(
    fromUserId: number,
    topic: string,
    content: string,
    mediaUrls: string[] = [],
    mentions: string[] = [],
    replyTo?: number,
  ) {
    const db = getDB();
    const result = db.prepare(
      'INSERT INTO messages (topic, from_user_id, content, media_urls, mentions, reply_to) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      topic,
      fromUserId,
      content,
      mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
      mentions.length > 0 ? JSON.stringify(mentions) : null,
      replyTo || null,
    );

    return Number(result.lastInsertRowid);
  }

  static async getLatestMessageId(topic: string): Promise<number> {
    const row = getDB()
      .prepare('SELECT id FROM messages WHERE topic = ? ORDER BY id DESC LIMIT 1')
      .get(topic) as { id?: number } | undefined;
    const id = Number(row?.id || 0);
    return Number.isInteger(id) && id > 0 ? id : 0;
  }

  static async markTopicRead(userId: number, topic: string, messageId?: number): Promise<void> {
    const latestMessageId = Number.isInteger(messageId) ? Number(messageId) : await MessageService.getLatestMessageId(topic);
    const safeMessageId = Number.isInteger(latestMessageId) && latestMessageId > 0 ? latestMessageId : 0;
    getDB()
      .prepare(`
        INSERT INTO message_reads (user_id, topic, last_read_message_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, topic)
        DO UPDATE SET
          last_read_message_id = CASE
            WHEN excluded.last_read_message_id > message_reads.last_read_message_id THEN excluded.last_read_message_id
            ELSE message_reads.last_read_message_id
          END,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(userId, topic, safeMessageId);
  }

  static async createMessageMentionNotifications(
    fromUserId: number,
    topic: string,
    mentionHandles: string[],
    messageId: number,
    snippet: string,
  ): Promise<number[]> {
    const handles = stripCoachMentions(uniqueLower(mentionHandles));
    if (handles.length === 0) return [];

    const participants = await MessageService.getTopicParticipants(topic);
    if (participants.length === 0) return [];
    const participantSet = new Set(participants);

    const placeholders = handles.map(() => '?').join(',');
    const rows = getDB()
      .prepare(`SELECT id, lower(username) AS username_lower FROM users WHERE lower(username) IN (${placeholders})`)
      .all(...handles) as Array<{ id: number; username_lower: string }>;

    const insertStmt = getDB().prepare(`
      INSERT INTO mention_notifications (user_id, topic, message_id, source_type, source_id, snippet, is_read)
      VALUES (?, ?, ?, 'message', ?, ?, 0)
    `);

    const notified = new Set<number>();
    for (const row of rows) {
      if (!participantSet.has(Number(row.id))) continue;
      if (Number(row.id) === fromUserId) continue;

      insertStmt.run(row.id, topic, messageId, messageId, snippet.slice(0, 400));
      notified.add(Number(row.id));
    }

    return Array.from(notified);
  }

  static createPostCommentMentionNotifications(
    fromUserId: number,
    postId: number,
    mentionHandles: string[],
    commentId: number,
    snippet: string,
  ): number[] {
    const db = getDB();
    const handles = uniqueLower(mentionHandles);
    const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(postId) as { user_id?: number } | undefined;
    const recipients = new Set<number>();

    if (Number.isInteger(post?.user_id) && Number(post?.user_id) > 0 && Number(post?.user_id) !== fromUserId) {
      recipients.add(Number(post?.user_id));
    }

    if (handles.length > 0) {
      const placeholders = handles.map(() => '?').join(',');
      const users = db
        .prepare(`SELECT id FROM users WHERE lower(username) IN (${placeholders})`)
        .all(...handles) as Array<{ id: number }>;
      users.forEach((user) => {
        const id = Number(user.id);
        if (Number.isInteger(id) && id > 0 && id !== fromUserId) {
          recipients.add(id);
        }
      });
    }

    if (recipients.size === 0) return [];

    const insertStmt = db.prepare(`
      INSERT INTO mention_notifications (user_id, topic, message_id, source_type, source_id, snippet, is_read)
      VALUES (?, ?, NULL, 'post_comment', ?, ?, 0)
    `);

    recipients.forEach((userId) => {
      insertStmt.run(userId, `post_${postId}`, commentId, snippet.slice(0, 400));
    });

    return Array.from(recipients);
  }

  static getMentionNotifications(userId: number, limit = 40): MentionNotification[] {
    const rows = getDB()
      .prepare(`
        SELECT
          mn.id,
          mn.topic,
          mn.message_id,
          mn.source_type,
          mn.source_id,
          mn.snippet,
          mn.is_read,
          mn.created_at,
          m.from_user_id AS message_actor_id,
          mu.username AS message_actor_username,
          pc.user_id AS comment_actor_id,
          cu.username AS comment_actor_username
        FROM mention_notifications mn
        LEFT JOIN messages m ON m.id = mn.message_id
        LEFT JOIN users mu ON mu.id = m.from_user_id
        LEFT JOIN post_comments pc
          ON mn.source_type = 'post_comment' AND pc.id = mn.source_id
        LEFT JOIN users cu ON cu.id = pc.user_id
        WHERE mn.user_id = ?
        ORDER BY datetime(mn.created_at) DESC
        LIMIT ?
      `)
      .all(userId, limit) as Array<{
        id: number;
        topic: string | null;
        message_id: number | null;
        source_type: 'message' | 'post_comment';
        source_id: number;
        snippet: string | null;
        is_read: number;
        created_at: string;
        message_actor_id: number | null;
        message_actor_username: string | null;
        comment_actor_id: number | null;
        comment_actor_username: string | null;
      }>;

    return rows.map((row) => ({
      id: Number(row.id),
      topic: row.topic || null,
      message_id: row.message_id ? Number(row.message_id) : null,
      source_type: row.source_type,
      source_id: Number(row.source_id),
      snippet: String(row.snippet || ''),
      is_read: Number(row.is_read || 0) === 1,
      created_at: String(row.created_at),
      actor_user_id: row.source_type === 'post_comment'
        ? (row.comment_actor_id ? Number(row.comment_actor_id) : null)
        : (row.message_actor_id ? Number(row.message_actor_id) : null),
      actor_username: row.source_type === 'post_comment'
        ? (row.comment_actor_username || null)
        : (row.message_actor_username || null),
    }));
  }

  static markMentionNotificationsRead(userId: number, ids?: number[]) {
    const normalizedIds = (ids || [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);

    if (normalizedIds.length === 0) {
      const result = getDB()
        .prepare('UPDATE mention_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
        .run(userId);
      return Number(result.changes || 0);
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const result = getDB()
      .prepare(`UPDATE mention_notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`)
      .run(userId, ...normalizedIds);
    return Number(result.changes || 0);
  }
}
