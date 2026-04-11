import { getDB } from '../database/runtime-db.js';
import { parseCoachTopic } from '../services/message-service.js';
import { resolveGroupCoachInvocation } from '../utils/coach-mention.js';
import type { CoachId } from '../utils/coach-mention.js';
import type { CoachReplyJobPayload } from './coach-reply-queue.js';

const GROUP_PROMPT_MEMBER_LIMIT = 24;
const GROUP_PROMPT_RECENT_MESSAGE_LIMIT = 8;

function parseGroupId(topic: string): number | null {
  const match = String(topic || '').trim().match(/^grp_(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export interface BuildCoachReplyJobOptions {
  userId: number;
  topic: string;
  content: string;
  mentions: string[];
  mediaUrls: string[];
  mediaIds: string[];
  participantUserIds: number[];
  platform: string;
}

function uniqueUserIds(values: number[]): number[] {
  const unique = new Set<number>();
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric > 0) {
      unique.add(numeric);
    }
  }
  return Array.from(unique);
}

function compactPromptText(value: unknown, maxLength = 280): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function buildGroupCoachPrompt(options: BuildCoachReplyJobOptions): string {
  const groupId = parseGroupId(options.topic);
  if (!groupId) {
    return `Group message (topic ${options.topic})\n${options.content}`;
  }

  const db = getDB();
  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(groupId) as { id?: number; name?: string } | undefined;
  const sender = db.prepare('SELECT id, username, public_uuid FROM users WHERE id = ?').get(options.userId) as {
    id?: number;
    username?: string;
    public_uuid?: string | null;
  } | undefined;

  const members = db.prepare(`
    SELECT u.id, u.username, u.public_uuid
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY CASE WHEN u.id = ? THEN 0 ELSE 1 END, lower(u.username) ASC
    LIMIT ?
  `).all(groupId, options.userId, GROUP_PROMPT_MEMBER_LIMIT) as Array<{
    id?: number;
    username?: string;
    public_uuid?: string | null;
  }>;

  const recentMessages = db.prepare(`
    SELECT
      m.from_user_id,
      m.content,
      m.created_at,
      u.username,
      u.public_uuid
    FROM messages m
    LEFT JOIN users u ON u.id = m.from_user_id
    WHERE m.topic = ?
      AND m.from_user_id > 0
    ORDER BY m.id DESC
    LIMIT ?
  `).all(options.topic, GROUP_PROMPT_RECENT_MESSAGE_LIMIT) as Array<{
    from_user_id?: number;
    content?: string | null;
    created_at?: string | null;
    username?: string | null;
    public_uuid?: string | null;
  }>;

  const senderName = compactPromptText(sender?.username || `User ${options.userId}`, 60) || `User ${options.userId}`;
  const senderUuid = compactPromptText(sender?.public_uuid || `uuid_missing_${options.userId}`, 80) || `uuid_missing_${options.userId}`;
  const newMessageText = compactPromptText(options.content || '', 1_600) || '(sent attachments or a short non-text message)';
  const memberLines = members
    .map((member) => {
      const memberName = compactPromptText(member.username || `User ${member.id || 'unknown'}`, 60) || `User ${member.id || 'unknown'}`;
      const memberUuid = compactPromptText(member.public_uuid || `uuid_missing_${member.id || 'unknown'}`, 80) || `uuid_missing_${member.id || 'unknown'}`;
      const suffix = Number(member.id) === options.userId ? ' (current speaker)' : '';
      return `- ${memberName} [${memberUuid}]${suffix}`;
    });
  const recentLines = recentMessages
    .reverse()
    .map((message) => {
      const username = compactPromptText(message.username || `User ${message.from_user_id || 'unknown'}`, 60) || `User ${message.from_user_id || 'unknown'}`;
      const publicUuid = compactPromptText(message.public_uuid || `uuid_missing_${message.from_user_id || 'unknown'}`, 80) || `uuid_missing_${message.from_user_id || 'unknown'}`;
      const content = compactPromptText(message.content || '', 220) || '(attachments only)';
      return `- ${username} [${publicUuid}]: ${content}`;
    });

  return [
    '[GROUP_CONTEXT]',
    `Group: ${compactPromptText(group?.name || `Group ${groupId}`, 80) || `Group ${groupId}`} (topic ${options.topic})`,
    `Current speaker: ${senderName} [${senderUuid}]`,
    'Use usernames plus UUID tags to distinguish members. The current tool context maps to the current speaker only.',
    '',
    '[GROUP_MEMBERS]',
    memberLines.length > 0 ? memberLines.join('\n') : '- Member roster unavailable',
    '',
    '[RECENT_GROUP_MESSAGES]',
    recentLines.length > 0 ? recentLines.join('\n') : '- No earlier group messages loaded',
    '',
    '[NEW_GROUP_MESSAGE]',
    `${senderName} [${senderUuid}]: ${newMessageText}`,
  ].join('\n');
}

function groupCoachPlan(topic: string, mentions: string[]): { shouldReply: boolean; coachOverride?: CoachId } {
  const groupId = parseGroupId(topic);
  if (!groupId) {
    return { shouldReply: false };
  }

  const groupCoachEnabled = (getDB().prepare('SELECT coach_enabled FROM groups WHERE id = ?').get(groupId) as any)?.coach_enabled;
  return resolveGroupCoachInvocation(mentions, groupCoachEnabled);
}

export function buildCoachReplyJob(options: BuildCoachReplyJobOptions): CoachReplyJobPayload | null {
  const normalizedTopic = String(options.topic || '').trim();
  const coachThread = parseCoachTopic(normalizedTopic);
  const shouldCoachReplyInCoachThread = coachThread?.userId === options.userId;
  const groupPlan = groupCoachPlan(normalizedTopic, options.mentions);
  const shouldCoachReplyInGroup = groupPlan.shouldReply;

  if (!shouldCoachReplyInCoachThread && !shouldCoachReplyInGroup) {
    return null;
  }

  return {
    userId: options.userId,
    topic: normalizedTopic,
    prompt: shouldCoachReplyInGroup
      ? buildGroupCoachPrompt({ ...options, topic: normalizedTopic })
      : options.content,
    mediaUrls: Array.from(new Set(options.mediaUrls.map((item) => String(item || '').trim()).filter(Boolean))),
    mediaIds: Array.from(new Set(options.mediaIds.map((item) => String(item || '').trim()).filter(Boolean))),
    platform: options.platform,
    coachOverride: shouldCoachReplyInGroup ? groupPlan.coachOverride : coachThread?.coachId,
    conversationScope: shouldCoachReplyInGroup ? 'group' : 'coach_dm',
    allowWriteTools: !shouldCoachReplyInGroup,
    participantUserIds: uniqueUserIds(
      options.participantUserIds.length > 0 ? options.participantUserIds : [options.userId],
    ),
  };
}
