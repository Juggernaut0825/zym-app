import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import { profileService } from '../services/profile-service.js';
import { memoryService } from '../services/memory-service.js';
import { skillManager } from '../skills/skill-manager.js';
import { CoachPersona } from '../types.js';

export class CoachAgent {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async handleMessage(userId: string, message: string, persona: CoachPersona): Promise<string> {
    const systemPrompt = await this.buildSystemPrompt(persona);
    const profile = await profileService.getProfile(userId);
    const context = await memoryService.getContext(userId);

    await memoryService.addMessage(userId, 'user', message);

    const messages: Anthropic.MessageParam[] = [
      ...context.recentMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: `Profile: ${JSON.stringify(profile)}\n\n${message}` }
    ];

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: systemPrompt,
      messages
    });

    let finalText = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        finalText += block.text;
      }
    }

    await memoryService.addMessage(userId, 'assistant', finalText);
    return finalText;
  }

  private async buildSystemPrompt(persona: CoachPersona): Promise<string> {
    const soulContent = await fs.readFile(`./src/coach/${persona}.soul.md`, 'utf-8');
    return `${soulContent}\n\nYou are a fitness coach with access to tools for logging workouts and meals.`;
  }
}

export const coachAgent = new CoachAgent();
