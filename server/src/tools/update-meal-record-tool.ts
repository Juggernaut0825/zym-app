import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class UpdateMealRecordTool implements Tool {
  definition: ToolDefinition = {
    name: 'update_meal_record',
    description: 'Update an existing meal record by day and mealId. Use this for edit/fix/correction requests.',
    parameters: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'Local date bucket (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        mealId: { type: 'string', description: 'Existing meal record id to edit.', minLength: 3, maxLength: 120 },
        description: { type: 'string', description: 'Corrected meal description.', maxLength: 500 },
        calories: { type: 'number', description: 'Corrected calories.', minimum: 0, maximum: 10000 },
        protein_g: { type: 'number', description: 'Corrected protein grams.', minimum: 0, maximum: 500 },
        carbs_g: { type: 'number', description: 'Corrected carbohydrate grams.', minimum: 0, maximum: 1000 },
        fat_g: { type: 'number', description: 'Corrected fat grams.', minimum: 0, maximum: 500 },
        time: { type: 'string', description: 'Optional local time label.', maxLength: 8 },
        timezone: { type: 'string', description: 'Optional IANA timezone.', maxLength: 80 },
        occurredAt: { type: 'string', description: 'Optional corrected timestamp.', maxLength: 80 },
      },
      required: ['day', 'mealId'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.updateMealRecord(userId, args || {});
    return toJson(result);
  }
}
