import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class GetContextTool implements Tool {
  definition: ToolDefinition = {
    name: 'get_context',
    description: 'Read short-term session context, pinned facts, and recent messages for the current user.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Context scope: summary, recent, or full.',
          enum: ['summary', 'recent', 'full'],
        },
        limit: {
          type: 'integer',
          description: 'Maximum recent messages to include when scope is recent.',
          minimum: 1,
          maximum: 24,
        },
      },
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.getContext(userId, {
      scope: args?.scope,
      limit: args?.limit,
      sessionFile: context.sessionFile,
    });
    return toJson(result);
  }
}
