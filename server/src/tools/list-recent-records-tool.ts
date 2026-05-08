import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class ListRecentRecordsTool implements Tool {
  definition: ToolDefinition = {
    name: 'list_recent_records',
    description: 'List recent meal and/or training records so the coach can edit the correct existing item instead of duplicating it.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: 'meal, training, or all.',
          maxLength: 20,
        },
        days: {
          type: 'number',
          description: 'How many recent local days to inspect.',
          minimum: 1,
          maximum: 120,
        },
        limit: {
          type: 'number',
          description: 'Maximum records to return.',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.listRecentRecords(userId, {
      kind: args?.kind,
      days: args?.days,
      limit: args?.limit,
    });
    return toJson(result);
  }
}
