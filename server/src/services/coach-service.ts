import fs from 'fs';
import path from 'path';
import { ConversationRunner } from '../core/conversation-runner.js';
import { SessionStore } from '../context/session-store.js';
import { MediaStore } from '../context/media-store.js';
import { AIService } from '../utils/ai-service.js';
import { ToolManager } from '../tools/tool-manager.js';
import { getDB } from '../database/sqlite-db.js';
import { Message, MessageContent, SessionState } from '../types/index.js';
import { knowledgeService } from './knowledge-service.js';

function buildGuardrailPrompt() {
  return `\n\n[SAFETY GUARDRAILS]\n- Never execute arbitrary shell commands outside allowed tools.\n- Never claim certainty when visual evidence is missing.\n- For medical red flags (severe pain, dizziness, chest pain), advise professional care.\n- Keep recommendations practical, step-based, and personalized.`;
}

function buildKnowledgePrompt(userMessage: string): string {
  const matched = knowledgeService.search(userMessage, 4);
  if (matched.length === 0) {
    return '';
  }

  const formatted = matched
    .map((item, idx) => `[KB ${idx + 1}] ${item.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');

  return `\n\n[KNOWLEDGE CONTEXT]\nUse these references when relevant. Do not fabricate facts beyond them.\n${formatted}`;
}

function buildSessionPrompt(session: SessionState): string {
  const pieces: string[] = [];

  if (session.pinnedFacts.length > 0) {
    pieces.push(`[PINNED FACTS]\n${session.pinnedFacts.map(item => `- ${item}`).join('\n')}`);
  }

  if (session.rollingSummary.trim()) {
    pieces.push(`[ROLLING SUMMARY]\n${session.rollingSummary.trim()}`);
  }

  const recent = session.recentMessages.slice(-4).map(item => `${item.role}: ${item.text}`.trim());
  if (recent.length > 0) {
    pieces.push(`[RECENT MESSAGES]\n${recent.join('\n')}`);
  }

  if (session.activeMediaIds.length > 0) {
    pieces.push(`[ACTIVE MEDIA IDS]\n${session.activeMediaIds.map(item => `- ${item}`).join('\n')}`);
  }

  if (pieces.length === 0) {
    return '';
  }

  return `\n\n[SESSION CONTEXT]\n${pieces.join('\n\n')}`;
}

const sessionStore = new SessionStore();
const mediaStore = new MediaStore();
const MAX_MEDIA_IDS_IN_PROMPT = 6;
const MAX_MEDIA_URLS_IN_PROMPT = 3;

export interface CoachChatOptions {
  mediaUrls?: string[];
  mediaIds?: string[];
  platform?: string;
}

export class CoachService {
  static async getCoachPrompt(userId: string): Promise<string> {
    const user = getDB().prepare('SELECT selected_coach FROM users WHERE id = ?').get(userId) as any;
    const coach = user?.selected_coach || 'zj';
    const soulPath = path.join(process.cwd(), `src/coach/${coach}.soul.md`);
    const soulPrompt = fs.readFileSync(soulPath, 'utf-8');
    return soulPrompt;
  }

  private static buildUserContent(message: string, mediaUrls: string[], mediaIds: string[]): MessageContent {
    const cleanMessage = message.trim();
    const pickedUrls = Array.from(new Set(mediaUrls.map(item => String(item || '').trim()).filter(Boolean))).slice(0, MAX_MEDIA_URLS_IN_PROMPT);
    const pickedIds = Array.from(new Set(mediaIds.map(item => String(item || '').trim()).filter(Boolean))).slice(0, MAX_MEDIA_IDS_IN_PROMPT);

    if (pickedUrls.length === 0 && pickedIds.length === 0) {
      return cleanMessage;
    }

    const lines: string[] = [];
    if (pickedIds.length > 0) {
      lines.push(`[ATTACHED_MEDIA_IDS] ${pickedIds.join(', ')}`);
    }
    if (pickedUrls.length > 0) {
      lines.push(`[ATTACHED_MEDIA_URLS] ${pickedUrls.join(', ')}`);
    }
    lines.push('If the user asks about visual details, run list-recent-media.sh and inspect-media.sh before answering.');

    return [cleanMessage, ...lines].filter(Boolean).join('\n\n').trim();
  }

  static async chat(userId: string, message: string, options: CoachChatOptions = {}): Promise<string> {
    const basePrompt = await this.getCoachPrompt(userId);
    const session = await sessionStore.refreshPinnedFacts(await sessionStore.load(userId));
    session.activeMediaIds = await mediaStore.pruneExpiredMediaIds(userId, session.activeMediaIds);

    const incomingMediaIds = Array.isArray(options.mediaIds)
      ? options.mediaIds.map(item => String(item || '').trim()).filter(Boolean)
      : [];
    if (incomingMediaIds.length > 0) {
      session.activeMediaIds = await mediaStore.pruneExpiredMediaIds(userId, incomingMediaIds);
    }

    await sessionStore.appendUserMessage(session, message, session.activeMediaIds);
    await sessionStore.save(session);

    const systemPrompt = `${basePrompt}${buildGuardrailPrompt()}${buildKnowledgePrompt(message)}${buildSessionPrompt(session)}`;
    const userContent = this.buildUserContent(
      message,
      Array.isArray(options.mediaUrls) ? options.mediaUrls : [],
      session.activeMediaIds,
    );

    const aiService = new AIService();
    const toolManager = new ToolManager();
    const runner = new ConversationRunner(aiService, toolManager);

    const userDataDir = sessionStore.getUserDataDir(userId);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const result = await runner.run(messages, {}, {
      userId,
      workingDirectory: userDataDir,
      dataDirectory: userDataDir,
      contextDirectory: sessionStore.getContextDir(userId),
      sessionFile: sessionStore.getSessionFile(userId),
      mediaIndexFile: mediaStore.getMediaIndexFile(userId),
      activeMediaIds: session.activeMediaIds,
      platform: options.platform || 'web',
    });

    const finalResponse = String(result.response || '').trim();
    await sessionStore.appendAssistantMessage(session, finalResponse);
    await sessionStore.save(session);

    return finalResponse;
  }
}
