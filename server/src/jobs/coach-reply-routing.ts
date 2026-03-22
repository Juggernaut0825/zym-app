import { getDB } from '../database/runtime-db.js';
import { resolveGroupCoachInvocation } from '../utils/coach-mention.js';
import type { CoachId } from '../utils/coach-mention.js';
import type { CoachReplyJobPayload } from './coach-reply-queue.js';

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
  const shouldCoachReplyInCoachThread = normalizedTopic === `coach_${options.userId}`;
  const groupPlan = groupCoachPlan(normalizedTopic, options.mentions);
  const shouldCoachReplyInGroup = groupPlan.shouldReply;

  if (!shouldCoachReplyInCoachThread && !shouldCoachReplyInGroup) {
    return null;
  }

  return {
    userId: options.userId,
    topic: normalizedTopic,
    prompt: shouldCoachReplyInGroup
      ? `Group message (topic ${normalizedTopic})\n${options.content}`
      : options.content,
    mediaUrls: Array.from(new Set(options.mediaUrls.map((item) => String(item || '').trim()).filter(Boolean))),
    mediaIds: Array.from(new Set(options.mediaIds.map((item) => String(item || '').trim()).filter(Boolean))),
    platform: options.platform,
    coachOverride: shouldCoachReplyInGroup ? groupPlan.coachOverride : undefined,
    conversationScope: shouldCoachReplyInGroup ? 'group' : 'coach_dm',
    allowWriteTools: !shouldCoachReplyInGroup,
    participantUserIds: uniqueUserIds(
      options.participantUserIds.length > 0 ? options.participantUserIds : [options.userId],
    ),
  };
}
