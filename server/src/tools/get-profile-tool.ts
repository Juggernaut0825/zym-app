import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class GetProfileTool implements Tool {
  definition: ToolDefinition = {
    name: 'get_profile',
    description: 'Read the current user profile values and derived metrics.',
    parameters: {
      type: 'object',
      properties: {},
    },
  };

  async execute(_: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.getProfile(userId);
    return toJson(result);
  }
}
