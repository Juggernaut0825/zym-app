import { MediaService } from './media-service.js';
import { OpenRouterUsageService } from './openrouter-usage-service.js';

export class FitnessSkills {
  static async analyzeFood(imagePath: string): Promise<any> {
    const model = process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview';
    const startedAt = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this food image and estimate calories, protein, carbs, fat.' },
            { type: 'image_url', image_url: { url: imagePath } }
          ]
        }]
      })
    });
    const payload = await response.json();
    if (response.ok) {
      OpenRouterUsageService.recordSuccessFromPayload(payload, {
        source: 'fitness_skill_food_analysis',
        requestKind: 'chat',
        model,
      }, startedAt);
    } else {
      OpenRouterUsageService.recordFailure(new Error(`OpenRouter request failed (${response.status})`), {
        source: 'fitness_skill_food_analysis',
        requestKind: 'chat',
        model,
      }, startedAt);
    }
    return payload;
  }

  static async analyzeWorkoutVideo(videoPath: string): Promise<any> {
    const analysis = await MediaService.analyzeForm(videoPath);
    return {
      success: true,
      analysis,
    };
  }

  static async generateWorkoutPlan(userId: number, goal: string): Promise<any> {
    const model = process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview';
    const startedAt = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: `Create a workout plan for goal: ${goal}`
        }]
      })
    });
    const payload = await response.json();
    if (response.ok) {
      OpenRouterUsageService.recordSuccessFromPayload(payload, {
        source: 'fitness_skill_workout_plan',
        requestKind: 'chat',
        userId,
        model,
        metadata: { goal: String(goal || '').slice(0, 120) },
      }, startedAt);
    } else {
      OpenRouterUsageService.recordFailure(new Error(`OpenRouter request failed (${response.status})`), {
        source: 'fitness_skill_workout_plan',
        requestKind: 'chat',
        userId,
        model,
        metadata: { goal: String(goal || '').slice(0, 120) },
      }, startedAt);
    }
    return payload;
  }
}
