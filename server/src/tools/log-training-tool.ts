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
          description: 'Array of training entries with fields like name, sets, reps, weight_kg. If the user gives pounds/lbs, convert to kilograms before calling this tool.',
          itemType: 'object',
          items: {
            type: 'object',
            description: 'A single exercise log entry.',
            properties: {
              name: {
                type: 'string',
                description: 'Exercise name.',
                minLength: 1,
                maxLength: 120,
              },
              sets: {
                type: 'number',
                description: 'Number of sets performed.',
                minimum: 0,
                maximum: 50,
              },
              reps: {
                type: 'string',
                description: 'Repetition count or rep range, for example 5 or 8-10.',
                minLength: 1,
                maxLength: 20,
              },
              weight_kg: {
                type: 'number',
                description: 'Optional working weight in kilograms. If the user gives pounds/lbs, convert pounds to kilograms before calling this tool.',
                minimum: 0,
                maximum: 500,
              },
              notes: {
                type: 'string',
                description: 'Optional short notes about the set or session.',
                maxLength: 500,
              },
            },
          },
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
