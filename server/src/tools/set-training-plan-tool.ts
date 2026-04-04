import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class SetTrainingPlanTool implements Tool {
  definition: ToolDefinition = {
    name: 'set_training_plan',
    description: 'Create or replace a structured training plan for a day, including exercises, sets, reps, rest, and optional exercise_key values from the internal exercise library.',
    parameters: {
      type: 'object',
      properties: {
        plan: {
          type: 'object',
          description: 'Training plan object with day, title, summary, and exercises. Each exercise may include exercise_key, name, sets, reps, rest_seconds, cue, notes, and optional demo URLs.',
        },
      },
      required: ['plan'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const plan = args?.plan;
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      throw new Error('plan must be an object');
    }
    const result = await coachTypedToolsService.setTrainingPlan(userId, plan);
    return toJson(result);
  }
}
