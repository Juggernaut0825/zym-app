import { MediaService } from './media-service.js';

export class FitnessSkills {
  static async analyzeFood(imagePath: string): Promise<any> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this food image and estimate calories, protein, carbs, fat.' },
            { type: 'image_url', image_url: { url: imagePath } }
          ]
        }]
      })
    });
    return response.json();
  }

  static async analyzeWorkoutVideo(videoPath: string): Promise<any> {
    const analysis = await MediaService.analyzeForm(videoPath);
    return {
      success: true,
      analysis,
    };
  }

  static async generateWorkoutPlan(userId: number, goal: string): Promise<any> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview',
        messages: [{
          role: 'user',
          content: `Create a workout plan for goal: ${goal}`
        }]
      })
    });
    return response.json();
  }
}
