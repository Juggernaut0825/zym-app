import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class UpdateTrainingRecordTool implements Tool {
  definition: ToolDefinition = {
    name: 'update_training_record',
    description: 'Update an existing training record by day and trainingId. Use this for edit/fix/correction requests.',
    parameters: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'Local date bucket (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        trainingId: { type: 'string', description: 'Existing training record id to edit.', minLength: 3, maxLength: 120 },
        name: { type: 'string', description: 'Corrected exercise or session name.', maxLength: 120 },
        sets: { type: 'number', description: 'Corrected set count.', minimum: 0, maximum: 60 },
        reps: { type: 'string', description: 'Corrected rep target or result.', maxLength: 20 },
        weight_kg: { type: 'number', description: 'Corrected load in kilograms.', minimum: 0, maximum: 500 },
        notes: { type: 'string', description: 'Corrected notes.', maxLength: 500 },
        time: { type: 'string', description: 'Optional local time label.', maxLength: 8 },
        timezone: { type: 'string', description: 'Optional IANA timezone.', maxLength: 80 },
        occurredAt: { type: 'string', description: 'Optional corrected timestamp.', maxLength: 80 },
      },
      required: ['day', 'trainingId'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.updateTrainingRecord(userId, args || {});
    return toJson(result);
  }
}
