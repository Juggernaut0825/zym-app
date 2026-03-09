import { getDB } from '../database/sqlite-db.js';

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

        return {
          topic: item.topic,
          other_user_id: String(otherUserId),
          username: user?.username || `User ${otherUserId}`,
          avatar_url: user?.avatar_url || null,
          last_message_at: item.last_message_at,
          last_message_preview: preview?.content || '',
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
      const preview = db.prepare('SELECT content FROM messages WHERE topic = ? ORDER BY created_at DESC LIMIT 1').get(`grp_${group.id}`) as any;
      return {
        id: group.id,
        topic: `grp_${group.id}`,
        name: group.name,
        coach_enabled: group.coach_enabled,
        last_message_at: group.last_message_at || null,
        last_message_preview: preview?.content || '',
      };
    });

    const coachTopic = `coach_${currentUserId}`;
    const coachLast = db.prepare('SELECT MAX(created_at) as last_message_at FROM messages WHERE topic = ?').get(coachTopic) as any;
    const coachPreview = db.prepare('SELECT content FROM messages WHERE topic = ? ORDER BY created_at DESC LIMIT 1').get(coachTopic) as any;

    return {
      coach: {
        topic: coachTopic,
        last_message_at: coachLast?.last_message_at || null,
        last_message_preview: coachPreview?.content || '',
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
      created_at: row.created_at,
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
}
