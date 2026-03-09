import fs from 'fs/promises';
import path from 'path';

interface SessionContext {
  recentMessages: Array<{ role: string; content: string }>;
  rollingSummary?: string;
}

export class MemoryService {
  private dataDir = './data';

  private getContextPath(userId: string): string {
    return path.join(this.dataDir, userId, 'context', 'session.json');
  }

  async getContext(userId: string): Promise<SessionContext> {
    try {
      const data = await fs.readFile(this.getContextPath(userId), 'utf-8');
      return JSON.parse(data);
    } catch {
      return { recentMessages: [] };
    }
  }

  async addMessage(userId: string, role: string, content: string): Promise<void> {
    const context = await this.getContext(userId);
    context.recentMessages.push({ role, content });

    if (context.recentMessages.length > 20) {
      context.recentMessages = context.recentMessages.slice(-10);
    }

    await this.saveContext(userId, context);
  }

  private async saveContext(userId: string, context: SessionContext): Promise<void> {
    const contextDir = path.dirname(this.getContextPath(userId));
    await fs.mkdir(contextDir, { recursive: true });
    await fs.writeFile(this.getContextPath(userId), JSON.stringify(context, null, 2));
  }
}

export const memoryService = new MemoryService();
