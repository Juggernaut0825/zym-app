import { createServer, type IncomingMessage, type Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { AuthService } from '../services/auth-service.js';
import { ActivityNotificationService } from '../services/activity-notification-service.js';
import { MediaAssetService } from '../services/media-asset-service.js';
import { MessageService, decodeUtf8Base64, encodeUtf8Base64 } from '../services/message-service.js';
import {
  mediaPathFromFileName,
  normalizeMediaStorageValue,
  resolveMediaArrayForDelivery,
  resolveMediaForDelivery,
} from '../security/media-url.js';
import { extractMentionHandles } from '../utils/coach-mention.js';
import { logger } from '../utils/logger.js';
import { buildCoachReplyJob } from '../jobs/coach-reply-routing.js';
import { enqueueCoachReply } from '../jobs/coach-reply-worker.js';
import { publishRealtimeEvent, subscribeToRealtimeEvents } from '../realtime/realtime-event-bus.js';
import type { RealtimeEvent, RealtimeCoachStatus } from '../realtime/realtime-events.js';
import { resolveUploadsDir } from '../config/app-paths.js';
import { getRuntimeHealthReport } from '../health/runtime-health.js';

const ALLOWED_MEDIA_URL_PROTOCOLS = new Set(['http:', 'https:']);
const MAX_CHAT_MESSAGE_CHARACTERS = 8000;

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
  contentB64?: string;
  content_b64?: string;
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
  private httpServer: HTTPServer;
  private clients = new Map<WebSocket, Client>();
  private heartbeatTimer: NodeJS.Timeout;
  private realtimeUnsubscribe: (() => void) | null = null;
  private readonly maxSubscriptionsPerClient = 80;
  private readonly rateLimitWindowMs = 30_000;
  private readonly maxMessagesPerWindow = 90;
  private readonly sessionValidationIntervalMs = 15_000;
  private readonly publicMediaOrigin: string | null = this.resolvePublicMediaOrigin();
  private readonly mediaAssetService = MediaAssetService.createFromEnvironment({
    uploadsDir: resolveUploadsDir(),
  });

  constructor(port: number) {
    this.httpServer = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
    this.httpServer.on('upgrade', (request, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });
    this.wss.on('connection', this.handleConnection.bind(this));
    this.httpServer.listen(port, () => {
      console.log(`WebSocket server running on port ${port}`);
    });
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 30_000);
    WSServer.instanceRef = this;
    void this.attachRealtimeSubscription();
  }

  private async handleHttpRequest(req: IncomingMessage, res: any): Promise<void> {
    const method = String(req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (method === 'GET' && url.pathname === '/health') {
      const report = await getRuntimeHealthReport();
      const body = JSON.stringify(report);
      res.statusCode = report.ok ? 200 : 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(body));
      res.end(body);
      return;
    }

    res.statusCode = 426;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      error: 'Upgrade Required',
      hint: 'Connect with WebSocket or use GET /health for health checks.',
    }));
  }

  private handleUpgrade(request: IncomingMessage, socket: any, head: Buffer) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
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
    const asset = this.mediaAssetService.getByStorageValue(value);
    if (asset) {
      const mediaPath = mediaPathFromFileName(asset.fileName);
      const deliveredAssetPath = mediaPath ? resolveMediaForDelivery(mediaPath) : '';
      if (!deliveredAssetPath) return null;
      if (!deliveredAssetPath.startsWith('/')) return deliveredAssetPath;
      return this.publicMediaOrigin ? `${this.publicMediaOrigin}${deliveredAssetPath}` : deliveredAssetPath;
    }
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

  private mediaPathsForAssetIds(assetIds: string[]): string[] {
    const paths: string[] = [];
    for (const assetId of assetIds) {
      const asset = this.mediaAssetService.getById(assetId);
      const mediaPath = asset ? mediaPathFromFileName(asset.fileName) || '' : '';
      if (mediaPath) {
        paths.push(mediaPath);
      }
    }
    return Array.from(new Set(paths));
  }

  private resolveOwnedAssetIds(userId: number, mediaIds: string[], mediaUrls: string[]): string[] {
    const collected = new Set<string>();
    for (const asset of this.mediaAssetService.getOwnedReadyAssets(userId, mediaIds)) {
      collected.add(asset.id);
    }
    for (const mediaUrl of mediaUrls) {
      const asset = this.mediaAssetService.getByStorageValue(mediaUrl);
      if (asset && asset.ownerUserId === userId && asset.status === 'ready') {
        collected.add(asset.id);
      }
    }
    return Array.from(collected);
  }

  private normalizeOutgoingMessage(message: unknown): unknown {
    if (!message || typeof message !== 'object') return message;
    const raw = message as Record<string, unknown>;
    const content = typeof raw.content === 'string' ? raw.content : '';
    return {
      ...raw,
      content_b64: typeof raw.content_b64 === 'string' ? raw.content_b64 : encodeUtf8Base64(content),
      avatar_url: this.mediaUrlForClient(raw.avatar_url),
      media_urls: this.mediaUrlsForClient(raw.media_urls),
    };
  }

  private async attachRealtimeSubscription(): Promise<void> {
    try {
      this.realtimeUnsubscribe = await subscribeToRealtimeEvents((event) => {
        this.handleRealtimeEvent(event);
      });
    } catch (error) {
      logger.error('[ws] failed to attach realtime subscription', error);
    }
  }

  private handleRealtimeEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'message_created':
        this.broadcastToTopic(event.topic, {
          type: 'message_created',
          topic: event.topic,
          clientMessageId: event.clientMessageId ? String(event.clientMessageId) : undefined,
          message: this.normalizeOutgoingMessage(event.message),
        });
        return;
      case 'typing':
        this.broadcastToTopic(event.topic, {
          type: 'typing',
          topic: event.topic,
          userId: event.userId,
          isTyping: Boolean(event.isTyping),
        });
        return;
      case 'coach_status':
        this.broadcastToTopic(event.topic, {
          type: 'coach_status',
          topic: event.topic,
          phase: String(event.status.phase || 'composing'),
          label: String(event.status.label || ''),
          active: Boolean(event.status.active),
          tool: event.status.tool ? String(event.status.tool) : undefined,
        });
        return;
      case 'inbox_updated':
        this.deliverInboxUpdated(event.userIds);
        return;
      case 'friends_updated':
        this.deliverFriendsUpdated(event.userIds);
        return;
    }
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

    if ((msg.type === 'send_message' || msg.type === 'message') && msg.topic) {
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

      const decodedContent = decodeUtf8Base64(msg.contentB64) || decodeUtf8Base64(msg.content_b64);
      const rawContent = String(decodedContent ?? msg.content ?? '').trim();
      if (rawContent.length > MAX_CHAT_MESSAGE_CHARACTERS) {
        this.send(ws, { type: 'error', message: `Message is too long. Keep it under ${MAX_CHAT_MESSAGE_CHARACTERS} characters.` });
        return;
      }
      const content = rawContent;
      const mediaUrls = this.sanitizeMediaUrls(msg.mediaUrls, 5);
      const mediaIds = this.sanitizeMediaIds(msg.mediaIds, 5);
      const resolvedAssetIds = this.resolveOwnedAssetIds(userId, mediaIds, mediaUrls);
      const resolvedMediaUrls = mediaUrls.length > 0 ? mediaUrls : this.mediaPathsForAssetIds(resolvedAssetIds);
      if (!content && resolvedMediaUrls.length === 0 && resolvedAssetIds.length === 0) {
        this.send(ws, { type: 'error', message: 'Empty message' });
        return;
      }

      const mentions = extractMentionHandles(content);
      const messageId = await MessageService.sendMessage(userId, topic, content, resolvedMediaUrls, mentions);
      await this.mediaAssetService.attachAssetsToMessage(resolvedAssetIds, userId, messageId, topic);
      await MessageService.markTopicRead(userId, topic, messageId);
      const mentionTargets = await MessageService.createMessageMentionNotifications(
        userId,
        topic,
        mentions,
        messageId,
        content,
      );
      const participants = await MessageService.getTopicParticipants(topic);
      const activityNotificationTargets = ActivityNotificationService.createMessageNotifications(
        userId,
        topic,
        messageId,
        content || (resolvedMediaUrls.length > 0 ? 'Sent an attachment' : 'New message'),
        participants,
      );
      const [created] = await MessageService.getMessages(topic, 1);
      this.broadcastMessage(topic, created || {
        id: messageId,
        topic,
        from_user_id: userId,
        content,
        content_b64: encodeUtf8Base64(content),
        media_urls: resolvedMediaUrls,
        mentions,
        created_at: new Date().toISOString(),
      });

      const recipientsToRefresh = Array.from(new Set([
        ...(participants.length > 0 ? participants : [userId]),
        ...mentionTargets,
        ...activityNotificationTargets,
      ]));
      if (recipientsToRefresh.length > 0) {
        this.notifyInboxUpdated(recipientsToRefresh);
      }

      const coachReplyJob = buildCoachReplyJob({
        userId,
        topic,
        content,
        mentions,
        mediaUrls: this.mediaUrlsForClient(resolvedMediaUrls),
        mediaIds: resolvedAssetIds.length > 0 ? resolvedAssetIds : mediaIds,
        participantUserIds: participants,
        platform: 'websocket',
      });
      if (coachReplyJob) {
        try {
          await enqueueCoachReply(coachReplyJob);
        } catch (error) {
          logger.error('[ws] failed to enqueue coach reply', error);
        }
      }
    }
  }

  private isValidTopic(topic: string): boolean {
    return /^(coach_(?:zj|lc)_\d+|coach_\d+|p2p_\d+_\d+|grp_\d+)$/.test(String(topic || '').trim());
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

  private publishEvent(event: RealtimeEvent) {
    void publishRealtimeEvent(event).catch((error) => {
      logger.error('[ws] realtime publish failed', error);
    });
  }

  private broadcastToTopic(topic: string, payload: unknown) {
    for (const client of this.clients.values()) {
      if (!client.authenticated) continue;
      if (!client.subscriptions.has(topic)) continue;
      this.send(client.ws, payload);
    }
  }

  broadcastMessage(topic: string, message: unknown) {
    this.publishEvent({ type: 'message_created', topic, message });
  }

  broadcastTyping(topic: string, userId: string, isTyping: boolean) {
    this.publishEvent({
      type: 'typing',
      topic,
      userId,
      isTyping,
    });
  }

  broadcastCoachStatus(
    topic: string,
    status: RealtimeCoachStatus,
  ) {
    this.publishEvent({
      type: 'coach_status',
      topic,
      status,
    });
  }

  notifyInboxUpdated(userIds: number[]) {
    this.publishEvent({
      type: 'inbox_updated',
      userIds: Array.from(new Set(userIds)),
    });
  }

  notifyFriendsUpdated(userIds: number[]) {
    this.publishEvent({
      type: 'friends_updated',
      userIds: Array.from(new Set(userIds)),
    });
  }

  private deliverInboxUpdated(userIds: number[]) {
    const unique = new Set(userIds);
    for (const client of this.clients.values()) {
      if (!client.authenticated || client.userId === null) continue;
      if (!unique.has(client.userId)) continue;
      this.send(client.ws, { type: 'inbox_updated' });
    }
  }

  private deliverFriendsUpdated(userIds: number[]) {
    const unique = new Set(userIds);
    for (const client of this.clients.values()) {
      if (!client.authenticated || client.userId === null) continue;
      if (!unique.has(client.userId)) continue;
      this.send(client.ws, { type: 'friends_updated' });
    }
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeatTimer);
    this.realtimeUnsubscribe?.();
    this.realtimeUnsubscribe = null;
    WSServer.instanceRef = WSServer.instanceRef === this ? null : WSServer.instanceRef;

    for (const client of this.clients.values()) {
      try {
        client.ws.close(1001, 'Server shutting down');
      } catch {
        client.ws.terminate();
      }
    }

    await new Promise<void>((resolve) => {
      this.wss.close(() => {
        this.httpServer.close(() => resolve());
      });
    });
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
