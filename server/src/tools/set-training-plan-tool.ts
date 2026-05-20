import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class SetTrainingPlanTool implements Tool {
  definition: ToolDefinition = {
    name: 'set_training_plan',
    description: 'Create or replace a structured training plan for a local day.',
    parameters: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          description: 'Local date bucket (YYYY-MM-DD). Defaults to today if omitted.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone like America/New_York.',
          minLength: 3,
          maxLength: 80,
        },
        title: {
          type: 'string',
          description: 'Short plain-text plan title without emoji, for example Upper Body 40.',
          minLength: 2,
          maxLength: 160,
        },
        summary: {
          type: 'string',
          description: 'One concise explanation of why this plan fits the user today.',
          maxLength: 800,
        },
        exercises: {
          type: 'array',
          description: 'Ordered exercise list. Keep beginner plans short and clear. For each exercise, pass the exercise_key returned by search_exercise so the in-house demo media (images, target muscle, equipment) is auto-attached for the user.',
          itemType: 'object',
          items: {
            type: 'object',
            properties: {
              exercise_key: { type: 'string', description: 'The exercise_key returned by search_exercise (e.g. "Barbell_Bench_Press_-_Medium_Grip"). Always include this when the exercise comes from search_exercise results so the demo images render on iOS and web.', minLength: 1, maxLength: 120 },
              name: { type: 'string', description: 'Exercise name.', minLength: 1, maxLength: 120 },
              sets: { type: 'number', description: 'Number of working sets.', minimum: 1, maximum: 20 },
              reps: { type: 'string', description: 'Rep target such as 8-10 or 30 sec.', minLength: 1, maxLength: 30 },
              rest_seconds: { type: 'number', description: 'Suggested rest time in seconds.', minimum: 15, maximum: 600 },
              target_weight_kg: { type: 'number', description: 'Optional external target load in kilograms. Choose a conservative working-load target when reasonable; for bodyweight-only movements omit this and use notes/cue instead of fake 0 kg.', minimum: 0, maximum: 500 },
              cue: { type: 'string', description: 'One short form or intent cue.', maxLength: 220 },
              notes: { type: 'string', description: 'Optional exercise-specific notes.', maxLength: 500 },
            },
          },
        },
      },
      required: ['title', 'exercises'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.setTrainingPlan(userId, {
      day: args?.day,
      timezone: args?.timezone,
      title: String(args?.title || '').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim(),
      summary: args?.summary,
      exercises: args?.exercises,
    });
    return toJson(result);
  }
}
