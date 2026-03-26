import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { toJson } from './base-tool-helpers.js';

export class SearchExerciseVideosTool implements Tool {
  definition: ToolDefinition = {
    name: 'search_exercise_videos',
    description: 'Search for exercise demo videos and return clickable YouTube links when a movement demonstration would help.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Exercise or movement query to search for.',
          minLength: 2,
          maxLength: 240,
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of video results to return.',
          minimum: 1,
          maximum: 5,
        },
      },
      required: ['query'],
    },
  };

  async execute(args: any, _context: ToolExecutionContext): Promise<string> {
    const result = await coachTypedToolsService.searchExerciseVideos({
      query: args?.query,
      maxResults: args?.maxResults,
    });
    return toJson(result);
  }
}
