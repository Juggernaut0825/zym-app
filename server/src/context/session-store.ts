import fs from 'fs/promises';
import path from 'path';
import { CompactMessage, MediaRef, SessionState } from '../types/index.js';
import { resolveUserDataDir } from '../utils/path-resolver.js';
import { buildCoachProgressPinnedFacts } from '../utils/coach-progress.js';

const MAX_RECENT_MESSAGES = 12;
const SUMMARY_BATCH_SIZE = 6;
const MAX_SUMMARY_CHARS = 1200;
const MAX_ACTIVE_MEDIA = 6;
const SESSION_KEY_FALLBACK = 'default';

function nowIso(): string {
  return new Date().toISOString();
}

function createMessageId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function isTrivialMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return ['hi', 'hello', 'ok', 'got it', 'thanks'].includes(normalized);
}

function trimSummary(summary: string): string {
  return summary.length <= MAX_SUMMARY_CHARS ? summary : summary.slice(summary.length - MAX_SUMMARY_CHARS);
}

function sanitizeSessionKey(sessionKey?: string): string {
  const normalized = String(sessionKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || SESSION_KEY_FALLBACK;
}

function summarizeMessages(messages: CompactMessage[]): string {
  return messages
    .filter(message => !isTrivialMessage(message.text))
    .map(message => {
      const prefix =
        message.role === 'user'
          ? 'User'
          : message.role === 'tool'
            ? `Tool${message.toolName ? `(${message.toolName})` : ''}`
            : 'Assistant';
      const compact = message.text.replace(/\s+/g, ' ').trim();
      return `${prefix}: ${compact}`;
    })
    .join('\n');
}

function buildPinnedFacts(profile: Record<string, unknown>, daily: Record<string, unknown> = {}): string[] {
  const facts: string[] = [];

  const height = profile.height ?? profile.height_cm;
  const weight = profile.weight ?? profile.weight_kg;
  const age = profile.age;
  const goal = profile.goal;
  const dailyTarget = profile.daily_target;

  if (height && weight) {
    facts.push(`Height ${height}, weight ${weight}`);
  } else if (height) {
    facts.push(`Height ${height}`);
  } else if (weight) {
    facts.push(`Weight ${weight}`);
  }

  if (age) {
    facts.push(`Age ${age}`);
  }

  if (goal) {
    facts.push(`Current goal: ${goal}`);
  }

  if (dailyTarget) {
    facts.push(`Daily target ${dailyTarget} kcal`);
  }

  return [...facts, ...buildCoachProgressPinnedFacts(daily, goal)].slice(0, 8);
}

export class SessionStore {
  getUserDataDir(userId: string): string {
    return resolveUserDataDir(userId);
  }

  getContextDir(userId: string): string {
    return path.join(this.getUserDataDir(userId), 'context');
  }

  getSessionFile(userId: string, sessionKey?: string): string {
    return path.join(this.getContextDir(userId), 'sessions', `${sanitizeSessionKey(sessionKey)}.json`);
  }

  getTranscriptFile(userId: string): string {
    return path.join(this.getContextDir(userId), 'transcript.ndjson');
  }

  async load(userId: string, sessionKey?: string): Promise<SessionState> {
    const filePath = this.getSessionFile(userId, sessionKey);
    return this.loadFromFile(userId, filePath);
  }

  async loadFromFile(userId: string, filePath?: string): Promise<SessionState> {
    const resolvedFilePath = String(filePath || '').trim() || this.getSessionFile(userId);
    await ensureDir(path.dirname(resolvedFilePath));
    try {
      const raw = await fs.readFile(resolvedFilePath, 'utf8');
      const parsed = JSON.parse(raw) as SessionState;
      return {
        schemaVersion: 1,
        userId,
        rollingSummary: parsed.rollingSummary || '',
        pinnedFacts: Array.isArray(parsed.pinnedFacts) ? parsed.pinnedFacts : [],
        recentMessages: Array.isArray(parsed.recentMessages) ? parsed.recentMessages : [],
        activeMediaIds: Array.isArray(parsed.activeMediaIds) ? parsed.activeMediaIds : [],
        lastMessageAt: parsed.lastMessageAt,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return this.createEmptyState(userId);
      }
      throw error;
    }
  }

  async save(state: SessionState, sessionKey?: string): Promise<void> {
    const filePath = this.getSessionFile(state.userId, sessionKey);
    await this.saveToFile(state, filePath);
  }

  async saveToFile(state: SessionState, filePath?: string): Promise<void> {
    this.compressIfNeeded(state);
    state.activeMediaIds = state.activeMediaIds.slice(-MAX_ACTIVE_MEDIA);

    const resolvedFilePath = String(filePath || '').trim() || this.getSessionFile(state.userId);
    await ensureDir(path.dirname(resolvedFilePath));
    await writeJsonAtomic(resolvedFilePath, state);
  }

  async refreshPinnedFacts(state: SessionState): Promise<SessionState> {
    const profilePath = path.join(this.getUserDataDir(state.userId), 'profile.json');
    const dailyPath = path.join(this.getUserDataDir(state.userId), 'daily.json');

    try {
      const raw = await fs.readFile(profilePath, 'utf8');
      const profile = JSON.parse(raw) as Record<string, unknown>;
      let daily: Record<string, unknown> = {};
      try {
        const rawDaily = await fs.readFile(dailyPath, 'utf8');
        const parsedDaily = JSON.parse(rawDaily) as Record<string, unknown>;
        daily = parsedDaily && typeof parsedDaily === 'object' && !Array.isArray(parsedDaily) ? parsedDaily : {};
      } catch (dailyError: any) {
        if (dailyError.code !== 'ENOENT') {
          throw dailyError;
        }
      }
      state.pinnedFacts = buildPinnedFacts(profile, daily);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      state.pinnedFacts = [];
    }

    return state;
  }

  async appendUserMessage(state: SessionState, text: string, mediaIds: string[] = []): Promise<CompactMessage> {
    const message = this.createMessage('user', text, mediaIds);
    state.recentMessages.push(message);
    state.lastMessageAt = message.createdAt;
    if (mediaIds.length > 0) {
      state.activeMediaIds = [...state.activeMediaIds, ...mediaIds].slice(-MAX_ACTIVE_MEDIA);
    }
    await this.appendTranscript(state.userId, message);
    return message;
  }

  async appendAssistantMessage(state: SessionState, text: string): Promise<CompactMessage> {
    const message = this.createMessage('assistant', text);
    state.recentMessages.push(message);
    state.lastMessageAt = message.createdAt;
    await this.appendTranscript(state.userId, message);
    return message;
  }

  async appendToolSummary(
    state: SessionState,
    toolName: string,
    summary: string,
    mediaIds: string[] = [],
  ): Promise<CompactMessage> {
    const message = this.createMessage('tool', summary, mediaIds, toolName);
    state.recentMessages.push(message);
    state.lastMessageAt = message.createdAt;
    await this.appendTranscript(state.userId, message);
    return message;
  }

  async pruneActiveMedia(state: SessionState, mediaRefs: MediaRef[]): Promise<SessionState> {
    const valid = new Set(mediaRefs.map(ref => ref.id));
    state.activeMediaIds = state.activeMediaIds.filter(id => valid.has(id)).slice(-MAX_ACTIVE_MEDIA);
    return state;
  }

  private compressIfNeeded(state: SessionState): void {
    while (state.recentMessages.length > MAX_RECENT_MESSAGES) {
      const chunk = state.recentMessages.splice(0, SUMMARY_BATCH_SIZE);
      const summaryChunk = summarizeMessages(chunk);
      if (summaryChunk) {
        const merged = [state.rollingSummary, summaryChunk].filter(Boolean).join('\n');
        state.rollingSummary = trimSummary(merged);
      }
    }
  }

  private createMessage(
    role: CompactMessage['role'],
    text: string,
    mediaIds: string[] = [],
    toolName?: string,
  ): CompactMessage {
    return {
      id: createMessageId(role),
      role,
      text,
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      toolName,
      createdAt: nowIso(),
    };
  }

  private createEmptyState(userId: string): SessionState {
    return {
      schemaVersion: 1,
      userId,
      rollingSummary: '',
      pinnedFacts: [],
      recentMessages: [],
      activeMediaIds: [],
    };
  }

  private async appendTranscript(userId: string, message: CompactMessage): Promise<void> {
    const filePath = this.getTranscriptFile(userId);
    await ensureDir(path.dirname(filePath));
    await fs.appendFile(filePath, `${JSON.stringify(message)}\n`, 'utf8');
  }
}
