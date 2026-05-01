import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class LogCheckInTool implements Tool {
  definition: ToolDefinition = {
    name: 'log_check_in',
    description: 'Log a progress check-in like bodyweight, body fat, and a short daily note.',
    parameters: {
      type: 'object',
      properties: {
        weight_kg: {
          type: 'number',
          description: 'Optional bodyweight in kilograms. If the user gives pounds/lbs, convert pounds to kilograms before calling this tool.',
          minimum: 20,
          maximum: 350,
        },
        body_fat_pct: {
          type: 'number',
          description: 'Optional body-fat percentage.',
          minimum: 2,
          maximum: 70,
        },
        notes: {
          type: 'string',
          description: 'Optional short note about the day, including recovery, waist, hunger, adherence, or anything else worth remembering.',
          maxLength: 500,
        },
        localDate: {
          type: 'string',
          description: 'Optional local date bucket (YYYY-MM-DD) for backfill logs.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        occurredAt: {
          type: 'string',
          description: 'Optional ISO datetime when the check-in happened.',
          maxLength: 60,
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone like America/New_York.',
          minLength: 3,
          maxLength: 80,
        },
      },
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.logCheckIn(userId, {
      weight_kg: args?.weight_kg,
      body_fat_pct: args?.body_fat_pct,
      notes: args?.notes,
      localDate: args?.localDate,
      occurredAt: args?.occurredAt,
      timezone: args?.timezone,
    });
    return toJson(result);
  }
}
