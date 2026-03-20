import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { toJson } from './base-tool-helpers.js';

export class SearchKnowledgeTool implements Tool {
  definition: ToolDefinition = {
    name: 'search_knowledge',
    description: 'Search grounded professional knowledge from the local and vector knowledge bases.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Knowledge query text.',
          minLength: 2,
          maxLength: 2000,
        },
        domains: {
          type: 'array',
          description: 'Optional domain filters. Use fitness and/or nutrition.',
          itemType: 'string',
          itemEnum: ['fitness', 'nutrition'],
          maxItems: 2,
        },
        topK: {
          type: 'integer',
          description: 'Maximum number of matches to return.',
          minimum: 1,
          maximum: 8,
        },
        minScore: {
          type: 'number',
          description: 'Minimum similarity score (0-1).',
          minimum: 0,
          maximum: 1,
        },
      },
      required: ['query'],
    },
  };

  async execute(args: any, _context: ToolExecutionContext): Promise<string> {
    const result = await coachTypedToolsService.searchKnowledge({
      query: args?.query,
      domains: args?.domains,
      topK: args?.topK,
      minScore: args?.minScore,
    });
    return toJson(result);
  }
}
