import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class LogCheckInTool implements Tool {
  definition: ToolDefinition = {
    name: 'log_check_in',
    description: 'Log a progress check-in like weight, waist, body fat, energy, hunger, recovery, or adherence.',
    parameters: {
      type: 'object',
      properties: {
        weight_kg: {
          type: 'number',
          description: 'Optional bodyweight in kilograms.',
          minimum: 20,
          maximum: 350,
        },
        body_fat_pct: {
          type: 'number',
          description: 'Optional body-fat percentage.',
          minimum: 2,
          maximum: 70,
        },
        waist_cm: {
          type: 'number',
          description: 'Optional waist measurement in centimeters.',
          minimum: 30,
          maximum: 250,
        },
        energy: {
          type: 'number',
          description: 'Optional energy rating from 1 to 5.',
          minimum: 1,
          maximum: 5,
        },
        hunger: {
          type: 'number',
          description: 'Optional hunger rating from 1 to 5.',
          minimum: 1,
          maximum: 5,
        },
        recovery: {
          type: 'number',
          description: 'Optional recovery rating from 1 to 5.',
          minimum: 1,
          maximum: 5,
        },
        adherence: {
          type: 'string',
          description: 'Optional adherence label.',
          enum: ['on_track', 'partial', 'off_track'],
        },
        notes: {
          type: 'string',
          description: 'Optional short note about how the day felt.',
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
      waist_cm: args?.waist_cm,
      energy: args?.energy,
      hunger: args?.hunger,
      recovery: args?.recovery,
      adherence: args?.adherence,
      notes: args?.notes,
      localDate: args?.localDate,
      occurredAt: args?.occurredAt,
      timezone: args?.timezone,
    });
    return toJson(result);
  }
}
