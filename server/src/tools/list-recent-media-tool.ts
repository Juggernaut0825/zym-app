import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class ListRecentMediaTool implements Tool {
  definition: ToolDefinition = {
    name: 'list_recent_media',
    description: 'List recent uploaded media IDs available for inspection or history lookup.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of media records to return.',
          minimum: 1,
          maximum: 20,
        },
        activeOnly: {
          type: 'boolean',
          description: 'If true, return only currently active media.',
        },
      },
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.listRecentMedia(userId, {
      limit: args?.limit,
      activeOnly: args?.activeOnly,
    });
    return toJson(result);
  }
}
