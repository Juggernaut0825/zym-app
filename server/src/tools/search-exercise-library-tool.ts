import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { toJson } from './base-tool-helpers.js';

export class SearchExerciseLibraryTool implements Tool {
  definition: ToolDefinition = {
    name: 'search_exercise_library',
    description: 'Search the internal common exercise library and return stable exercise_key values plus built-in demo images for common gym movements.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Exercise name or variation to look up, for example incline dumbbell press or cable lateral raise.',
          minLength: 2,
          maxLength: 240,
        },
        limit: {
          type: 'number',
          description: 'Maximum matches to return.',
          minimum: 1,
          maximum: 8,
        },
      },
      required: ['query'],
    },
  };

  async execute(args: any, _context: ToolExecutionContext): Promise<string> {
    const result = await coachTypedToolsService.searchExerciseLibrary({
      query: args?.query,
      limit: args?.limit,
    });
    return toJson(result);
  }
}
