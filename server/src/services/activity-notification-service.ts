import { getDB } from '../database/runtime-db.js';

export type ActivityNotificationSourceType = 'message' | 'post_comment' | 'post_reaction';

export interface ActivityNotification {
  id: number;
  topic: string | null;
  message_id: number | null;
  post_id: number | null;
  source_type: ActivityNotificationSourceType;
  source_id: number;
  snippet: string;
  is_read: boolean;
  created_at: string;
  actor_user_id: number | null;
  actor_username: string | null;
}

export interface UserNotificationPreferences {
  messageNotificationsEnabled: boolean;
  postNotificationsEnabled: boolean;
}

export interface ConversationNotificationPreference {
  topic: string;
  muted: boolean;
}

function toBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  return Number(value) === 1;
}

export class ActivityNotificationService {
  static getUserPreferences(userId: number): UserNotificationPreferences {
    const row = getDB()
      .prepare('SELECT message_notifications_enabled, post_notifications_enabled FROM users WHERE id = ?')
      .get(userId) as { message_notifications_enabled?: number; post_notifications_enabled?: number } | undefined;

    return {
      messageNotificationsEnabled: toBool(row?.message_notifications_enabled, true),
      postNotificationsEnabled: toBool(row?.post_notifications_enabled, true),
    };
  }

  static updateUserPreferences(
    userId: number,
    patch: Partial<UserNotificationPreferences>,
  ): UserNotificationPreferences {
    const current = this.getUserPreferences(userId);
    const next = {
      messageNotificationsEnabled: patch.messageNotificationsEnabled ?? current.messageNotificationsEnabled,
      postNotificationsEnabled: patch.postNotificationsEnabled ?? current.postNotificationsEnabled,
    };

    getDB()
      .prepare(`
        UPDATE users
        SET message_notifications_enabled = ?, post_notifications_enabled = ?
        WHERE id = ?
      `)
      .run(
        next.messageNotificationsEnabled ? 1 : 0,
        next.postNotificationsEnabled ? 1 : 0,
        userId,
      );

    return next;
  }

  static getConversationPreference(userId: number, topic: string): ConversationNotificationPreference {
    const row = getDB()
      .prepare('SELECT muted FROM conversation_notification_settings WHERE user_id = ? AND topic = ?')
      .get(userId, topic) as { muted?: number } | undefined;

    return {
      topic,
      muted: toBool(row?.muted, false),
    };
  }

  static setConversationPreference(
    userId: number,
    topic: string,
    muted: boolean,
  ): ConversationNotificationPreference {
    getDB()
      .prepare(`
        INSERT INTO conversation_notification_settings (user_id, topic, muted, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, topic)
        DO UPDATE SET muted = excluded.muted, updated_at = CURRENT_TIMESTAMP
      `)
      .run(userId, topic, muted ? 1 : 0);

    return {
      topic,
      muted,
    };
  }

  static isConversationMuted(userId: number, topic: string): boolean {
    return this.getConversationPreference(userId, topic).muted;
  }

  static createMessageNotifications(
    fromUserId: number,
    topic: string,
    messageId: number,
    snippet: string,
    participantUserIds: number[],
  ): number[] {
    const recipients = Array.from(new Set(
      participantUserIds
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0 && item !== fromUserId),
    )).filter((recipientId) => {
      const prefs = this.getUserPreferences(recipientId);
      return prefs.messageNotificationsEnabled && !this.isConversationMuted(recipientId, topic);
    });

    if (recipients.length === 0) return [];

    const insertStmt = getDB().prepare(`
      INSERT OR IGNORE INTO activity_notifications (
        user_id,
        topic,
        message_id,
        post_id,
        source_type,
        source_id,
        actor_user_id,
        snippet,
        is_read
      )
      VALUES (?, ?, ?, NULL, 'message', ?, ?, ?, 0)
    `);

    recipients.forEach((recipientId) => {
      insertStmt.run(
        recipientId,
        topic,
        messageId,
        messageId,
        fromUserId,
        snippet.slice(0, 400),
      );
    });

    return recipients;
  }

  static createPostCommentNotification(input: {
    postId: number;
    commentId: number;
    postOwnerId: number;
    actorUserId: number;
    snippet: string;
  }): number[] {
    const { postId, commentId, postOwnerId, actorUserId, snippet } = input;
    if (!postOwnerId || postOwnerId === actorUserId) return [];

    const prefs = this.getUserPreferences(postOwnerId);
    if (!prefs.postNotificationsEnabled) return [];

    getDB().prepare(`
      INSERT OR IGNORE INTO activity_notifications (
        user_id,
        topic,
        message_id,
        post_id,
        source_type,
        source_id,
        actor_user_id,
        snippet,
        is_read
      )
      VALUES (?, ?, NULL, ?, 'post_comment', ?, ?, ?, 0)
    `).run(
      postOwnerId,
      `post_${postId}`,
      postId,
      commentId,
      actorUserId,
      snippet.slice(0, 400),
    );

    return [postOwnerId];
  }

  static createPostReactionNotification(input: {
    postId: number;
    reactionId: number;
    postOwnerId: number;
    actorUserId: number;
    snippet?: string;
  }): number[] {
    const { postId, reactionId, postOwnerId, actorUserId, snippet } = input;
    if (!postOwnerId || postOwnerId === actorUserId) return [];

    const prefs = this.getUserPreferences(postOwnerId);
    if (!prefs.postNotificationsEnabled) return [];

    getDB().prepare(`
      INSERT OR IGNORE INTO activity_notifications (
        user_id,
        topic,
        message_id,
        post_id,
        source_type,
        source_id,
        actor_user_id,
        snippet,
        is_read
      )
      VALUES (?, ?, NULL, ?, 'post_reaction', ?, ?, ?, 0)
    `).run(
      postOwnerId,
      `post_${postId}`,
      postId,
      reactionId,
      actorUserId,
      String(snippet || 'liked your post').slice(0, 400),
    );

    return [postOwnerId];
  }

  static listNotifications(userId: number, limit = 40): ActivityNotification[] {
    const safeLimit = Math.min(80, Math.max(1, Math.floor(Number(limit) || 40)));
    const rows = getDB()
      .prepare(`
        SELECT
          an.id,
          an.topic,
          an.message_id,
          an.post_id,
          an.source_type,
          an.source_id,
          an.snippet,
          an.is_read,
          an.created_at,
          an.actor_user_id,
          COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS actor_username
        FROM activity_notifications an
        LEFT JOIN users u ON u.id = an.actor_user_id
        WHERE an.user_id = ?
        ORDER BY datetime(an.created_at) DESC
        LIMIT ?
      `)
      .all(userId, safeLimit) as Array<{
        id: number;
        topic: string | null;
        message_id: number | null;
        post_id: number | null;
        source_type: ActivityNotificationSourceType;
        source_id: number;
        snippet: string | null;
        is_read: number;
        created_at: string;
        actor_user_id: number | null;
        actor_username: string | null;
      }>;

    return rows.map((row) => ({
      id: Number(row.id),
      topic: row.topic || null,
      message_id: row.message_id ? Number(row.message_id) : null,
      post_id: row.post_id ? Number(row.post_id) : null,
      source_type: row.source_type,
      source_id: Number(row.source_id),
      snippet: String(row.snippet || ''),
      is_read: Number(row.is_read || 0) === 1,
      created_at: String(row.created_at || ''),
      actor_user_id: row.actor_user_id ? Number(row.actor_user_id) : null,
      actor_username: row.actor_username || null,
    }));
  }

  static markNotificationsRead(userId: number, ids?: number[]): number {
    const normalizedIds = (ids || [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);

    if (normalizedIds.length === 0) {
      const result = getDB()
        .prepare('UPDATE activity_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
        .run(userId);
      return Number(result.changes || 0);
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const result = getDB()
      .prepare(`UPDATE activity_notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`)
      .run(userId, ...normalizedIds);
    return Number(result.changes || 0);
  }
}
