import { WebSocketServer, WebSocket } from 'ws';

const clients = new Map<number, WebSocket>();

export function startWebSocket(port: number) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    let userId: number | null = null;

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'auth') {
        userId = msg.userId;
        if (userId) clients.set(userId, ws);
      }

      if (msg.type === 'message') {
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'new_message', message: msg }));
          }
        });
      }
    });

    ws.on('close', () => {
      if (userId) clients.delete(userId);
    });
  });

  console.log(`WebSocket on ${port}`);
}
