import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { requireUserId, toJson } from './base-tool-helpers.js';

export class InspectMediaTool implements Tool {
  definition: ToolDefinition = {
    name: 'inspect_media',
    description: 'Run structured evidence-based inspection on an uploaded media item.',
    parameters: {
      type: 'object',
      properties: {
        mediaId: {
          type: 'string',
          description: 'Media ID to inspect. Supports both asset_... and med_... identifiers.',
          minLength: 8,
          maxLength: 128,
          pattern: '^(?:med|asset)_[a-zA-Z0-9._-]{4,120}$',
        },
        question: {
          type: 'string',
          description: 'Question to answer about this media.',
          maxLength: 500,
        },
        domain: {
          type: 'string',
          description: 'Inspection domain.',
          enum: ['training', 'food', 'chart', 'generic'],
        },
      },
      required: ['mediaId'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.inspectMedia(userId, {
      mediaId: args?.mediaId,
      question: args?.question,
      domain: args?.domain,
    });
    return toJson(result);
  }
}
