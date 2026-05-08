import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class DeleteRecordTool implements Tool {
  definition: ToolDefinition = {
    name: 'delete_record',
    description: 'Delete an existing meal or training record by day and id when the user asks to remove a duplicate or mistaken log.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'meal or training.', maxLength: 20 },
        day: { type: 'string', description: 'Local date bucket (YYYY-MM-DD).', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        recordId: { type: 'string', description: 'Existing record id to delete.', minLength: 3, maxLength: 120 },
      },
      required: ['kind', 'day', 'recordId'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.deleteRecord(userId, args || {});
    return toJson(result);
  }
}
