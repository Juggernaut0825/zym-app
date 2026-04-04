import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class GetTrainingPlanTool implements Tool {
  definition: ToolDefinition = {
    name: 'get_training_plan',
    description: 'Read the user training plan for a given day so the coach can reference or revise it.',
    parameters: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          description: 'Optional local date bucket (YYYY-MM-DD). Defaults to the user local day.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone like America/New_York.',
          minLength: 3,
          maxLength: 80,
        },
      },
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.getTrainingPlan(userId, {
      day: args?.day,
      timezone: args?.timezone,
    });
    return toJson(result);
  }
}
