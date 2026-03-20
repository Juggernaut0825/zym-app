import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class SetProfileTool implements Tool {
  definition: ToolDefinition = {
    name: 'set_profile',
    description: 'Update user profile fields such as height, weight, age, goal, and timezone with validation.',
    parameters: {
      type: 'object',
      properties: {
        profile: {
          type: 'object',
          description: 'Profile patch object with allowed keys like height_cm, weight_kg, age, gender, activity_level, goal, timezone.',
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
