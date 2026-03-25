import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class SetProfileTool implements Tool {
  definition: ToolDefinition = {
    name: 'set_profile',
    description: 'Update user profile fields such as height, weight, goal, gender, and activity with validation.',
    parameters: {
      type: 'object',
      properties: {
        profile: {
          type: 'object',
          description: 'Profile patch object with keys like height, weight, age, gender, activity_level, goal, experience_level, notes, or timezone.',
        },
      },
      required: ['profile'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const patch = args?.profile;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('profile must be an object');
    }
    const result = await coachTypedToolsService.setProfile(userId, patch);
    return toJson(result);
  }
}
