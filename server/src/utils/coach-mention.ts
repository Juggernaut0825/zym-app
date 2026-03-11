export type CoachId = 'zj' | 'lc';

const COACH_HANDLE_SET = new Set(['coach', 'zj', 'lc']);
const MENTION_RE = /@([a-zA-Z0-9_]+)/g;

export function extractMentionHandles(content: string): string[] {
  const text = String(content || '');
  const matches = Array.from(text.matchAll(MENTION_RE)).map((match) => String(match[1] || '').toLowerCase().trim());
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of matches) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    unique.push(item);
  }
  return unique;
}

export function isCoachHandle(handle: string): boolean {
  return COACH_HANDLE_SET.has(String(handle || '').toLowerCase());
}

export function stripCoachMentions(handles: string[]): string[] {
  return (handles || []).filter((item) => !isCoachHandle(item));
}

export function normalizeCoachId(value: unknown): CoachId | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'zj' || normalized === 'lc') {
    return normalized;
  }
  return null;
}

export function resolveGroupCoachInvocation(
  mentions: string[],
  groupCoachEnabled: unknown,
): { shouldReply: boolean; coachOverride?: CoachId } {
  const normalized = (mentions || []).map((item) => String(item || '').toLowerCase());
  const explicitCoach = normalized.find((item) => item === 'zj' || item === 'lc') as CoachId | undefined;
  if (explicitCoach) {
    return { shouldReply: true, coachOverride: explicitCoach };
  }

  if (!normalized.includes('coach')) {
    return { shouldReply: false };
  }

  const defaultCoach = normalizeCoachId(groupCoachEnabled);
  if (!defaultCoach) {
    return { shouldReply: false };
  }
  return { shouldReply: true, coachOverride: defaultCoach };
}

