import { WebSocketServer, WebSocket } from 'ws';
import { AuthService } from '../services/auth-service.js';
import { MessageService } from '../services/message-service.js';

interface Client {
  ws: WebSocket;
  userId: number | null;
  authenticated: boolean;
  subscriptions: Set<string>;
}

interface WSIncomingMessage {
  type: string;
  token?: string;
  topic?: string;
  content?: string;
  mediaUrls?: string[];
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

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', this.handleConnection.bind(this));
    WSServer.instanceRef = this;
    console.log(`WebSocket server running on port ${port}`);
  }

  private handleConnection(ws: WebSocket) {
    this.clients.set(ws, { ws, userId: null, authenticated: false, subscriptions: new Set() });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSIncomingMessage;
        await this.handleMessage(ws, msg);
      } catch {
        this.send(ws, { type: 'error', message: 'Invalid message payload' });
      }
    });

    ws.on('close', () => this.clients.delete(ws));
  }

  private async handleMessage(ws: WebSocket, msg: WSIncomingMessage) {
    const client = this.clients.get(ws);
    if (!client) return;

    if (msg.type === 'auth') {
      const payload = AuthService.verifyToken(msg.token || '');
      if (payload) {
        client.userId = Number(payload.userId);
        client.authenticated = true;
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

    if (msg.type === 'subscribe' && msg.topic) {
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
      if (!client.subscriptions.has(msg.topic)) {
        return;
      }
      this.broadcastTyping(msg.topic, String(client.userId), Boolean(msg.isTyping));
      return;
    }

    if (msg.type === 'send_message' && msg.topic) {
      const allowed = await MessageService.canAccessTopic(client.userId, msg.topic);
      if (!allowed) {
        this.send(ws, { type: 'error', message: 'Forbidden topic' });
        return;
      }

      const content = (msg.content || '').trim();
      const mediaUrls = Array.isArray(msg.mediaUrls) ? msg.mediaUrls : [];
      if (!content && mediaUrls.length === 0) {
        this.send(ws, { type: 'error', message: 'Empty message' });
        return;
      }

      const messageId = await MessageService.sendMessage(client.userId, msg.topic, content, mediaUrls);
      const [created] = await MessageService.getMessages(msg.topic, 1);
      this.broadcastMessage(msg.topic, created || {
        id: messageId,
        topic: msg.topic,
        from_user_id: client.userId,
        content,
        media_urls: mediaUrls,
        mentions: [],
        created_at: new Date().toISOString(),
      });
    }
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
    this.broadcastToTopic(topic, { type: 'message_created', topic, message });
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
}
