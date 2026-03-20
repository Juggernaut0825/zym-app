import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class LogTrainingTool implements Tool {
  definition: ToolDefinition = {
    name: 'log_training',
    description: 'Log structured training entries into daily records with date and timezone awareness.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          description: 'Array of training entries with fields like name, sets, reps, weight_kg.',
        },
        localDate: {
          type: 'string',
          description: 'Optional local date bucket (YYYY-MM-DD) for backfill logs.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        occurredAt: {
          type: 'string',
          description: 'Optional ISO datetime when the workout happened.',
          maxLength: 60,
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone like America/New_York.',
          minLength: 3,
          maxLength: 80,
        },
      },
      required: ['entries'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.logTraining(userId, args?.entries, {
      localDate: args?.localDate,
      occurredAt: args?.occurredAt,
      timezone: args?.timezone,
    });
    return toJson(result);
  }
}
