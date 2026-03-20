import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class LogMealTool implements Tool {
  definition: ToolDefinition = {
    name: 'log_meal',
    description: 'Estimate and log meal nutrition into daily records with date and timezone awareness.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Meal description in natural language.',
          minLength: 2,
          maxLength: 500,
        },
        localDate: {
          type: 'string',
          description: 'Optional local date bucket (YYYY-MM-DD) for backfill logs.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        occurredAt: {
          type: 'string',
          description: 'Optional ISO datetime when the meal happened.',
          maxLength: 60,
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone like America/New_York.',
          minLength: 3,
          maxLength: 80,
        },
      },
      required: ['description'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.logMeal(userId, String(args?.description || ''), {
      localDate: args?.localDate,
      occurredAt: args?.occurredAt,
      timezone: args?.timezone,
    });
    return toJson(result);
  }
}
