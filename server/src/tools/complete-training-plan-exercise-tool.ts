import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class CompleteTrainingPlanExerciseTool implements Tool {
  definition: ToolDefinition = {
    name: 'complete_training_plan_exercise',
    description: 'Mark a training plan exercise complete or incomplete and sync the daily training log.',
    parameters: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          description: 'Local date bucket (YYYY-MM-DD).',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        exerciseId: {
          type: 'string',
          description: 'Training plan exercise id.',
          minLength: 3,
          maxLength: 120,
        },
        completed: {
          type: 'boolean',
          description: 'True to complete, false to undo completion.',
        },
        occurredAt: {
          type: 'string',
          description: 'Optional ISO datetime when completion happened.',
          maxLength: 60,
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone like America/New_York.',
          minLength: 3,
          maxLength: 80,
        },
      },
      required: ['day', 'exerciseId', 'completed'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.toggleTrainingPlanExerciseCompletion(userId, {
      day: args?.day,
      exerciseId: args?.exerciseId,
      completed: args?.completed,
      occurredAt: args?.occurredAt,
      timezone: args?.timezone,
    });
    return toJson(result);
  }
}
