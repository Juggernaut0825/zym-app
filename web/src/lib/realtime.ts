import { WS_URL } from './config';
import { AppSocketEvent } from './types';
import { clearAuth } from './auth-storage';

type EventHandler = (event: AppSocketEvent | { type: string; [key: string]: unknown }) => void;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private connected = false;
  private authToken = '';
  private handlers = new Set<EventHandler>();
  private topics = new Set<string>();

  connect(token: string) {
    this.authToken = token;
    this.socket = new WebSocket(WS_URL);

    this.socket.onopen = () => {
      this.send({ type: 'auth', token: this.authToken });
      for (const topic of this.topics) {
        this.send({ type: 'subscribe', topic });
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as AppSocketEvent | { type: string; [key: string]: unknown };
        if (payload.type === 'auth_success') {
          this.connected = true;
          for (const topic of this.topics) {
            this.send({ type: 'subscribe', topic });
          }
        } else if (payload.type === 'auth_failed') {
          this.connected = false;
          this.authToken = '';
          clearAuth();
          this.socket?.close();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('zym-auth-expired', { detail: { path: '/ws' } }));
          }
        }
        this.handlers.forEach(handler => handler(payload));
      } catch {
        // Ignore malformed payloads.
      }
    };

    this.socket.onclose = () => {
      this.connected = false;
      setTimeout(() => {
        if (this.authToken) this.connect(this.authToken);
      }, 1200);
    };
  }

  updateToken(token: string) {
    if (!token) return;
    this.authToken = token;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'auth', token: this.authToken });
      for (const topic of this.topics) {
        this.send({ type: 'subscribe', topic });
      }
    }
  }

  disconnect() {
    this.authToken = '';
    this.connected = false;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.close();
    } else if (this.socket?.readyState === WebSocket.CONNECTING) {
      const pending = this.socket;
      pending.onopen = () => pending.close();
      pending.onmessage = null;
      pending.onerror = null;
      pending.onclose = null;
    }
    this.socket = null;
  }

  onEvent(handler: EventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribe(topic: string) {
    this.topics.add(topic);
    this.send({ type: 'subscribe', topic });
  }

  unsubscribe(topic: string) {
    this.topics.delete(topic);
    this.send({ type: 'unsubscribe', topic });
  }

  typing(topic: string, isTyping: boolean) {
    this.send({ type: 'typing', topic, isTyping });
  }

  private send(payload: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }
}
