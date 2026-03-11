import { WebSocketServer, WebSocket } from 'ws';
import { AuthService } from '../services/auth-service.js';
import { MessageService } from '../services/message-service.js';
import { normalizeMediaStorageValue, resolveMediaArrayForDelivery, resolveMediaForDelivery } from '../security/media-url.js';
import { CoachService } from '../services/coach-service.js';
import { getDB } from '../database/sqlite-db.js';
import { extractMentionHandles, resolveGroupCoachInvocation } from '../utils/coach-mention.js';

const ALLOWED_MEDIA_URL_PROTOCOLS = new Set(['http:', 'https:']);

interface Client {
  ws: WebSocket;
  userId: number | null;
  sessionId: string | null;
  authenticated: boolean;
  subscriptions: Set<string>;
  isAlive: boolean;
  recentMessageTimes: number[];
  lastSessionValidationAt: number;
}

interface WSIncomingMessage {
  type: string;
  token?: string;
  topic?: string;
  content?: string;
  mediaUrls?: string[];
  mediaIds?: string[];
  isTyping?: boolean;
}

export interface WSMessageEvent {
  topic: string;
  message: unknown;
}

export class WSServer {
  private static instanceRef: WSServer | null = null;

  static getInstance(): WSServer | null {
    return WSServer.instanceRef;
  }

  private wss: WebSocketServer;
  private clients = new Map<WebSocket, Client>();
  private heartbeatTimer: NodeJS.Timeout;
  private readonly maxSubscriptionsPerClient = 80;
  private readonly rateLimitWindowMs = 30_000;
  private readonly maxMessagesPerWindow = 90;
  private readonly sessionValidationIntervalMs = 15_000;
  private readonly publicMediaOrigin: string | null = this.resolvePublicMediaOrigin();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port, maxPayload: 128 * 1024 });
    this.wss.on('connection', this.handleConnection.bind(this));
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 30_000);
    WSServer.instanceRef = this;
    console.log(`WebSocket server running on port ${port}`);
  }

  private resolvePublicMediaOrigin(): string | null {
    const configured = String(process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || '').trim();
    if (configured) {
      try {
        return new URL(configured).origin.replace(/\/$/, '');
      } catch {
        // Fallback below.
      }
    }

    const fallbackHost = String(process.env.API_HOST || 'localhost').trim() || 'localhost';
    const fallbackPort = Number(process.env.API_PORT || process.env.PORT || 3001);
    if (!Number.isInteger(fallbackPort) || fallbackPort <= 0 || fallbackPort > 65535) {
      return `http://${fallbackHost}:3001`;
    }
    return `http://${fallbackHost}:${fallbackPort}`;
  }

  private handleConnection(ws: WebSocket) {
    this.clients.set(ws, {
      ws,
      userId: null,
      sessionId: null,
      authenticated: false,
      subscriptions: new Set(),
      isAlive: true,
      recentMessageTimes: [],
      lastSessionValidationAt: 0,
    });

    ws.on('pong', () => {
      const client = this.clients.get(ws);
      if (client) client.isAlive = true;
    });

    ws.on('message', async (data) => {
      try {
        if (this.byteLength(data) > 128 * 1024) {
          this.send(ws, { type: 'error', message: 'Payload too large' });
          ws.close(1009, 'Payload too large');
          return;
        }

        const client = this.clients.get(ws);
        if (!client) return;
        if (!this.allowIncomingMessage(client)) {
          this.send(ws, { type: 'error', message: 'Too many websocket events' });
          return;
        }

        const msg = JSON.parse(data.toString()) as WSIncomingMessage;
        await this.handleMessage(ws, msg);
      } catch {
        this.send(ws, { type: 'error', message: 'Invalid message payload' });
      }
    });

    ws.on('close', () => this.clients.delete(ws));
  }

  private sanitizeMediaUrls(input: unknown, maxItems = 5): string[] {
    if (!Array.isArray(input)) return [];

    const cleaned: string[] = [];
    for (const candidate of input) {
      if (cleaned.length >= maxItems) break;
      const value = String(candidate || '').trim().slice(0, 2048);
      if (!value) continue;
      const normalized = normalizeMediaStorageValue(value);
      if (!normalized) continue;
      if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        try {
          const parsed = new URL(normalized);
          if (!ALLOWED_MEDIA_URL_PROTOCOLS.has(parsed.protocol)) continue;
        } catch {
          continue;
        }
      }
      cleaned.push(normalized);
    }

    return Array.from(new Set(cleaned));
  }

  private sanitizeMediaIds(input: unknown, maxItems = 5): string[] {
    if (!Array.isArray(input)) return [];

    const cleaned: string[] = [];
    for (const candidate of input) {
      if (cleaned.length >= maxItems) break;
      const value = String(candidate || '').trim().slice(0, 128);
      if (!value) continue;
      if (!/^[a-zA-Z0-9_-]{3,128}$/.test(value)) continue;
      cleaned.push(value);
    }

    return Array.from(new Set(cleaned));
  }

  private mediaUrlForClient(mediaUrl: unknown): string | null {
    const value = String(mediaUrl || '').trim();
    if (!value) return null;
    const delivered = resolveMediaForDelivery(value);
    if (!delivered) return null;
    if (!delivered.startsWith('/')) return delivered;
    return this.publicMediaOrigin ? `${this.publicMediaOrigin}${delivered}` : delivered;
  }

  private mediaUrlsForClient(mediaUrls: unknown): string[] {
    const items = Array.isArray(mediaUrls) ? mediaUrls.map((item) => String(item || '')) : [];
    const delivered = resolveMediaArrayForDelivery(items);
    return delivered.map((item) => {
      if (!item.startsWith('/')) return item;
      return this.publicMediaOrigin ? `${this.publicMediaOrigin}${item}` : item;
    });
  }

  private normalizeOutgoingMessage(message: unknown): unknown {
    if (!message || typeof message !== 'object') return message;
    const raw = message as Record<string, unknown>;
    return {
      ...raw,
      avatar_url: this.mediaUrlForClient(raw.avatar_url),
      media_urls: this.mediaUrlsForClient(raw.media_urls),
    };
  }

  private parseGroupId(topic: string): number | null {
    const match = String(topic || '').trim().match(/^grp_(\d+)$/);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private async handleMessage(ws: WebSocket, msg: WSIncomingMessage) {
    const client = this.clients.get(ws);
    if (!client) return;

    if (msg.type === 'auth') {
      const payload = AuthService.verifyToken(msg.token || '');
      if (payload) {
        client.userId = Number(payload.userId);
        client.sessionId = payload.sid;
        client.authenticated = true;
        client.lastSessionValidationAt = Date.now();
        this.send(ws, { type: 'auth_success', userId: client.userId });
      } else {
        this.send(ws, { type: 'auth_failed' });
      }
      return;
    }

    if (!client.authenticated || client.userId === null) {
      this.send(ws, { type: 'error', message: 'Not authenticated' });
      return;
    }
    if (!this.ensureSessionStillValid(ws, client)) {
      return;
    }

    if (msg.type === 'subscribe' && msg.topic) {
      if (!this.isValidTopic(msg.topic)) {
        this.send(ws, { type: 'error', message: 'Invalid topic format' });
        return;
      }
      if (!client.subscriptions.has(msg.topic) && client.subscriptions.size >= this.maxSubscriptionsPerClient) {
        this.send(ws, { type: 'error', message: 'Subscription limit reached' });
        return;
      }
      const allowed = await MessageService.canAccessTopic(client.userId, msg.topic);
      if (!allowed) {
        this.send(ws, { type: 'error', message: 'Forbidden topic subscription' });
        return;
      }
      client.subscriptions.add(msg.topic);
      this.send(ws, { type: 'subscribed', topic: msg.topic });
      return;
    }

    if (msg.type === 'unsubscribe' && msg.topic) {
      client.subscriptions.delete(msg.topic);
      this.send(ws, { type: 'unsubscribed', topic: msg.topic });
      return;
    }

    if (msg.type === 'typing' && msg.topic) {
      if (!this.isValidTopic(msg.topic)) return;
      if (!client.subscriptions.has(msg.topic)) {
        return;
      }
      this.broadcastTyping(msg.topic, String(client.userId), Boolean(msg.isTyping));
      return;
    }

    if (msg.type === 'send_message' && msg.topic) {
      const topic = String(msg.topic);
      const userId = client.userId;
      if (userId === null) {
        this.send(ws, { type: 'error', message: 'Not authenticated' });
        return;
      }
      if (!this.isValidTopic(msg.topic)) {
        this.send(ws, { type: 'error', message: 'Invalid topic format' });
        return;
      }
      const allowed = await MessageService.canAccessTopic(userId, topic);
      if (!allowed) {
        this.send(ws, { type: 'error', message: 'Forbidden topic' });
        return;
      }

      const content = String(msg.content || '').trim().slice(0, 8000);
      const mediaUrls = this.sanitizeMediaUrls(msg.mediaUrls, 5);
      const mediaIds = this.sanitizeMediaIds(msg.mediaIds, 5);
      if (!content && mediaUrls.length === 0) {
        this.send(ws, { type: 'error', message: 'Empty message' });
        return;
      }

      const mentions = extractMentionHandles(content);
      const messageId = await MessageService.sendMessage(userId, topic, content, mediaUrls, mentions);
      await MessageService.markTopicRead(userId, topic, messageId);
      const mentionTargets = await MessageService.createMessageMentionNotifications(
        userId,
        topic,
        mentions,
        messageId,
        content,
      );
      const [created] = await MessageService.getMessages(topic, 1);
      this.broadcastMessage(topic, created || {
        id: messageId,
        topic,
        from_user_id: userId,
        content,
        media_urls: mediaUrls,
        mentions,
        created_at: new Date().toISOString(),
      });

      const participants = await MessageService.getTopicParticipants(topic);
      this.notifyInboxUpdated(participants.length > 0 ? participants : [userId]);
      if (mentionTargets.length > 0) {
        this.notifyInboxUpdated(mentionTargets);
      }

      const groupId = this.parseGroupId(topic);
      const shouldCoachReplyInCoachThread = topic === `coach_${userId}`;
      const groupCoachEnabled = groupId
        ? (getDB().prepare('SELECT coach_enabled FROM groups WHERE id = ?').get(groupId) as any)?.coach_enabled
        : 'none';
      const groupCoachInvocation = groupId
        ? resolveGroupCoachInvocation(mentions, groupCoachEnabled)
        : { shouldReply: false as const };
      const shouldCoachReplyInGroup = Boolean(groupId) && groupCoachInvocation.shouldReply;
      if (shouldCoachReplyInCoachThread || shouldCoachReplyInGroup) {
        this.broadcastTyping(topic, 'coach', true);
        void (async () => {
          try {
            const prompt = shouldCoachReplyInGroup
              ? `Group message (topic ${topic})\n${content}`
              : content;
            const coachOverride = shouldCoachReplyInGroup
              ? groupCoachInvocation.coachOverride
              : undefined;
            const deliveredMediaUrls = this.mediaUrlsForClient(mediaUrls);
            const aiResponse = await CoachService.chat(String(userId), prompt, {
              mediaUrls: deliveredMediaUrls,
              mediaIds,
              platform: 'web',
              coachOverride,
              conversationScope: shouldCoachReplyInGroup ? 'group' : 'coach_dm',
              allowWriteTools: shouldCoachReplyInGroup ? false : true,
            });
            await MessageService.sendMessage(0, topic, aiResponse, []);
            const [coachMessage] = await MessageService.getMessages(topic, 1);
            this.broadcastMessage(topic, coachMessage || {
              id: `coach_${Date.now()}`,
              topic,
              from_user_id: 0,
              content: aiResponse,
              media_urls: [],
              mentions: [],
              created_at: new Date().toISOString(),
            });
            this.notifyInboxUpdated(participants.length > 0 ? participants : [userId]);
          } catch (error) {
            console.error('Coach async reply failed (ws):', error);
          } finally {
            this.broadcastTyping(topic, 'coach', false);
          }
        })();
      }
    }
  }

  private isValidTopic(topic: string): boolean {
    return /^(coach_\d+|p2p_\d+_\d+|grp_\d+)$/.test(String(topic || '').trim());
  }

  private allowIncomingMessage(client: Client): boolean {
    const now = Date.now();
    const recent = client.recentMessageTimes.filter((ts) => now - ts < this.rateLimitWindowMs);
    if (recent.length >= this.maxMessagesPerWindow) {
      client.recentMessageTimes = recent;
      return false;
    }
    recent.push(now);
    client.recentMessageTimes = recent;
    return true;
  }

  private ensureSessionStillValid(ws: WebSocket, client: Client): boolean {
    if (!client.authenticated || client.userId === null || !client.sessionId) {
      this.send(ws, { type: 'auth_failed' });
      ws.close(4001, 'Session missing');
      return false;
    }

    const now = Date.now();
    if (now - client.lastSessionValidationAt < this.sessionValidationIntervalMs) {
      return true;
    }

    client.lastSessionValidationAt = now;
    const active = AuthService.isSessionActive(client.userId, client.sessionId);
    if (!active) {
      this.send(ws, { type: 'auth_failed' });
      ws.close(4001, 'Session expired');
      return false;
    }
    return true;
  }

  private heartbeat() {
    for (const client of this.clients.values()) {
      if (!client.isAlive) {
        client.ws.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ws.ping();
      } catch {
        client.ws.terminate();
      }
    }
  }

  private byteLength(data: any): number {
    if (typeof data === 'string') return Buffer.byteLength(data);
    if (Array.isArray(data)) {
      return data.reduce((sum, chunk) => sum + chunk.length, 0);
    }
    return data.byteLength;
  }

  private send(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private broadcastToTopic(topic: string, payload: unknown) {
    for (const client of this.clients.values()) {
      if (!client.authenticated) continue;
      if (!client.subscriptions.has(topic)) continue;
      this.send(client.ws, payload);
    }
  }

  broadcastMessage(topic: string, message: unknown) {
    this.broadcastToTopic(topic, { type: 'message_created', topic, message: this.normalizeOutgoingMessage(message) });
  }

  broadcastTyping(topic: string, userId: string, isTyping: boolean) {
    this.broadcastToTopic(topic, {
      type: 'typing',
      topic,
      userId,
      isTyping,
    });
  }

  notifyInboxUpdated(userIds: number[]) {
    const unique = new Set(userIds);
    for (const client of this.clients.values()) {
      if (!client.authenticated || client.userId === null) continue;
      if (!unique.has(client.userId)) continue;
      this.send(client.ws, { type: 'inbox_updated' });
    }
  }

  disconnectUserSession(userId: number, sessionId?: string) {
    for (const client of this.clients.values()) {
      if (!client.authenticated || client.userId !== userId) continue;
      if (sessionId && client.sessionId !== sessionId) continue;
      this.send(client.ws, { type: 'auth_failed' });
      client.ws.close(4001, 'Session revoked');
    }
  }

  disconnectUserSessions(userId: number, exceptSessionId?: string) {
    for (const client of this.clients.values()) {
      if (!client.authenticated || client.userId !== userId) continue;
      if (exceptSessionId && client.sessionId === exceptSessionId) continue;
      this.send(client.ws, { type: 'auth_failed' });
      client.ws.close(4001, 'Session revoked');
    }
  }
}
