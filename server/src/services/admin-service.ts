import { getDB } from '../database/runtime-db.js';
import { OpenRouterUsageService } from './openrouter-usage-service.js';

function toInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeString(value: unknown, maxLength = 240): string {
  return String(value || '').trim().slice(0, maxLength);
}

function toSqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeTimestamp(value: unknown): string | null {
  const raw = safeString(value, 80);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw}Z`
      : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function latestTimestamp(...values: Array<unknown>): string | null {
  const normalized = values
    .map((value) => normalizeTimestamp(value))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a));
  return normalized[0] || null;
}

function buildLikePattern(search: string): string {
  return `%${safeString(search, 120).toLowerCase()}%`;
}

export class AdminService {
  static async getOverview() {
    const db = getDB();
    const last24h = toSqlTimestamp(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const last7d = toSqlTimestamp(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    const basicStats = db.prepare(`
      SELECT
        (SELECT COUNT(1) FROM users) AS total_users,
        (SELECT COUNT(1) FROM users WHERE email_verified_at IS NOT NULL) AS verified_users,
        (SELECT COUNT(1) FROM users WHERE selected_coach IN ('zj', 'lc')) AS coach_selected_users,
        (SELECT COUNT(1) FROM groups) AS total_groups,
        (SELECT COUNT(1) FROM messages) AS total_messages,
        (SELECT COUNT(1) FROM messages WHERE from_user_id = 0) AS coach_messages,
        (SELECT COUNT(1) FROM posts) AS total_posts,
        (SELECT COUNT(1) FROM post_comments) AS total_comments,
        (SELECT COUNT(1) FROM abuse_reports WHERE status = 'open') AS open_reports,
        (SELECT COUNT(1) FROM security_events WHERE severity IN ('warn', 'high') AND created_at >= ?) AS warnings_24h,
        (SELECT COUNT(1) FROM user_sessions WHERE revoked_at IS NULL AND expires_at >= ?) AS active_sessions,
        (SELECT COUNT(1) FROM users WHERE created_at >= ?) AS signups_7d
    `).get(last24h, toSqlTimestamp(new Date()), last7d) as Record<string, unknown> | undefined;

    const activeUsers24h = db.prepare(`
      SELECT COUNT(DISTINCT user_id) AS count FROM (
        SELECT id AS user_id FROM users WHERE created_at >= ?
        UNION
        SELECT user_id FROM user_sessions WHERE last_seen_at >= ?
        UNION
        SELECT from_user_id AS user_id FROM messages WHERE from_user_id > 0 AND created_at >= ?
        UNION
        SELECT user_id FROM posts WHERE created_at >= ?
        UNION
        SELECT user_id FROM post_comments WHERE created_at >= ?
      ) active_users
    `).get(last24h, last24h, last24h, last24h, last24h) as Record<string, unknown> | undefined;

    const activeUsers7d = db.prepare(`
      SELECT COUNT(DISTINCT user_id) AS count FROM (
        SELECT id AS user_id FROM users WHERE created_at >= ?
        UNION
        SELECT user_id FROM user_sessions WHERE last_seen_at >= ?
        UNION
        SELECT from_user_id AS user_id FROM messages WHERE from_user_id > 0 AND created_at >= ?
        UNION
        SELECT user_id FROM posts WHERE created_at >= ?
        UNION
        SELECT user_id FROM post_comments WHERE created_at >= ?
      ) active_users
    `).get(last7d, last7d, last7d, last7d, last7d) as Record<string, unknown> | undefined;

    const recentUsers = db.prepare(`
      SELECT id, username, email, selected_coach, email_verified_at, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 8
    `).all().map((row: any) => ({
      id: toInteger(row?.id),
      username: safeString(row?.username, 64),
      email: safeString(row?.email, 160) || null,
      selectedCoach: safeString(row?.selected_coach, 8) || null,
      emailVerifiedAt: normalizeTimestamp(row?.email_verified_at),
      createdAt: normalizeTimestamp(row?.created_at),
    }));

    const recentWarnings = db.prepare(`
      SELECT id, user_id, event_type, severity, created_at
      FROM security_events
      WHERE severity IN ('warn', 'high')
      ORDER BY created_at DESC
      LIMIT 8
    `).all().map((row: any) => ({
      id: toInteger(row?.id),
      userId: toInteger(row?.user_id),
      eventType: safeString(row?.event_type, 120),
      severity: safeString(row?.severity, 16) || 'warn',
      createdAt: normalizeTimestamp(row?.created_at),
    }));

    const recentReports = db.prepare(`
      SELECT id, reporter_user_id, target_type, target_id, reason, status, created_at
      FROM abuse_reports
      ORDER BY created_at DESC
      LIMIT 8
    `).all().map((row: any) => ({
      id: toInteger(row?.id),
      reporterUserId: toInteger(row?.reporter_user_id),
      targetType: safeString(row?.target_type, 24),
      targetId: toInteger(row?.target_id),
      reason: safeString(row?.reason, 160),
      status: safeString(row?.status, 32) || 'open',
      createdAt: normalizeTimestamp(row?.created_at),
    }));

    return {
      stats: {
        totalUsers: toInteger(basicStats?.total_users),
        verifiedUsers: toInteger(basicStats?.verified_users),
        coachSelectedUsers: toInteger(basicStats?.coach_selected_users),
        totalGroups: toInteger(basicStats?.total_groups),
        totalMessages: toInteger(basicStats?.total_messages),
        coachMessages: toInteger(basicStats?.coach_messages),
        totalPosts: toInteger(basicStats?.total_posts),
        totalComments: toInteger(basicStats?.total_comments),
        openReports: toInteger(basicStats?.open_reports),
        warnings24h: toInteger(basicStats?.warnings_24h),
        activeSessions: toInteger(basicStats?.active_sessions),
        signups7d: toInteger(basicStats?.signups_7d),
        activeUsers24h: toInteger(activeUsers24h?.count),
        activeUsers7d: toInteger(activeUsers7d?.count),
      },
      recentUsers,
      recentWarnings,
      recentReports,
      openRouter: {
        local: OpenRouterUsageService.summarizeLocal(),
        live: await OpenRouterUsageService.fetchLiveSummary(),
      },
    };
  }

  static listUsers(search = '', limit = 500) {
    const db = getDB();
    const safeLimit = Math.min(5000, Math.max(10, Math.floor(Number(limit) || 500)));
    const normalizedSearch = safeString(search, 120).toLowerCase();
    const likePattern = buildLikePattern(normalizedSearch);

    const rows = db.prepare(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.selected_coach,
        u.email_verified_at,
        u.created_at,
        sess.last_seen_at,
        msg.total_messages_sent,
        msg.dm_messages_sent,
        msg.group_messages_sent,
        msg.coach_dm_messages_sent,
        msg.last_message_at,
        posts.posts_created,
        posts.last_post_at,
        comments.comments_created,
        comments.last_comment_at,
        memberships.groups_joined,
        usage.ai_requests,
        usage.ai_total_tokens,
        usage.ai_total_cost_usd,
        usage.last_request_at
      FROM users u
      LEFT JOIN (
        SELECT user_id, MAX(last_seen_at) AS last_seen_at
        FROM user_sessions
        GROUP BY user_id
      ) sess ON sess.user_id = u.id
      LEFT JOIN (
        SELECT
          from_user_id AS user_id,
          COUNT(1) AS total_messages_sent,
          SUM(CASE WHEN topic LIKE 'p2p_%' THEN 1 ELSE 0 END) AS dm_messages_sent,
          SUM(CASE WHEN topic LIKE 'grp_%' THEN 1 ELSE 0 END) AS group_messages_sent,
          SUM(CASE WHEN topic LIKE 'coach_%' THEN 1 ELSE 0 END) AS coach_dm_messages_sent,
          MAX(created_at) AS last_message_at
        FROM messages
        WHERE from_user_id > 0
        GROUP BY from_user_id
      ) msg ON msg.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(1) AS posts_created, MAX(created_at) AS last_post_at
        FROM posts
        GROUP BY user_id
      ) posts ON posts.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(1) AS comments_created, MAX(created_at) AS last_comment_at
        FROM post_comments
        GROUP BY user_id
      ) comments ON comments.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(1) AS groups_joined
        FROM group_members
        GROUP BY user_id
      ) memberships ON memberships.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(1) AS ai_requests,
          SUM(total_tokens) AS ai_total_tokens,
          SUM(COALESCE(estimated_cost_usd, 0)) AS ai_total_cost_usd,
          MAX(created_at) AS last_request_at
        FROM openrouter_usage_events
        WHERE user_id IS NOT NULL AND status = 'success'
        GROUP BY user_id
      ) usage ON usage.user_id = u.id
      WHERE (? = '' OR lower(u.username) LIKE ? OR lower(COALESCE(u.email, '')) LIKE ?)
      ORDER BY COALESCE(sess.last_seen_at, msg.last_message_at, posts.last_post_at, comments.last_comment_at, usage.last_request_at, u.created_at) DESC, u.created_at DESC
      LIMIT ?
    `).all(normalizedSearch, likePattern, likePattern, safeLimit);

    return (Array.isArray(rows) ? rows : []).map((row: any) => {
      const lastActiveAt = latestTimestamp(
        row?.last_seen_at,
        row?.last_message_at,
        row?.last_post_at,
        row?.last_comment_at,
        row?.last_request_at,
        row?.created_at,
      );
      return {
        id: toInteger(row?.id),
        username: safeString(row?.username, 64),
        email: safeString(row?.email, 160) || null,
        selectedCoach: safeString(row?.selected_coach, 8) || null,
        emailVerifiedAt: normalizeTimestamp(row?.email_verified_at),
        createdAt: normalizeTimestamp(row?.created_at),
        lastSeenAt: normalizeTimestamp(row?.last_seen_at),
        lastActiveAt,
        usage: {
          totalMessagesSent: toInteger(row?.total_messages_sent),
          dmMessagesSent: toInteger(row?.dm_messages_sent),
          groupMessagesSent: toInteger(row?.group_messages_sent),
          coachDmMessagesSent: toInteger(row?.coach_dm_messages_sent),
          postsCreated: toInteger(row?.posts_created),
          commentsCreated: toInteger(row?.comments_created),
          groupsJoined: toInteger(row?.groups_joined),
          aiRequests: toInteger(row?.ai_requests),
          aiTotalTokens: toInteger(row?.ai_total_tokens),
          aiEstimatedCostUsd: toNumber(row?.ai_total_cost_usd),
          aiLastRequestAt: normalizeTimestamp(row?.last_request_at),
        },
      };
    });
  }
}
