import path from 'path';
import { MediaAnalysis, Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import {
  getUserDataDir,
  listJsonFiles,
  readJsonFile,
  requireUserId,
  summarizeMediaAnalysis,
  toJson,
} from './base-tool-helpers.js';

function isSupportedDomain(value: unknown): value is MediaAnalysis['domain'] {
  return value === 'training' || value === 'food' || value === 'chart' || value === 'generic';
}

export class GetMediaAnalysesTool implements Tool {
  definition: ToolDefinition = {
    name: 'get_media_analyses',
    description: 'Read saved textual analyses for a previously uploaded media item.',
    parameters: {
      type: 'object',
      properties: {
        mediaId: {
          type: 'string',
          description: 'Media ID whose saved analyses should be loaded.',
          minLength: 8,
          maxLength: 128,
          pattern: '^(?:med|asset)_[a-zA-Z0-9._-]{4,120}$',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of analyses to return, newest first.',
          minimum: 1,
          maximum: 12,
        },
        domain: {
          type: 'string',
          description: 'Optional domain filter.',
          enum: ['training', 'food', 'chart', 'generic'],
        },
      },
      required: ['mediaId'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    requireUserId(context);
    const mediaId = String(args?.mediaId || '').trim();
    const limit = Math.max(1, Math.min(12, Number(args?.limit) || 5));
    const domain = isSupportedDomain(args?.domain) ? args.domain : undefined;
    const analysesDir = path.join(getUserDataDir(context), 'analyses', mediaId);
    const files = await listJsonFiles(analysesDir);

    const analyses = (await Promise.all(
      files.map((filePath) => readJsonFile<MediaAnalysis>(filePath).catch(() => null)),
    ))
      .filter((item): item is MediaAnalysis => Boolean(item))
      .filter((item) => !domain || item.domain === domain)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);

    return toJson({
      mediaId,
      totalAnalyses: analyses.length,
      analyses: analyses.map((analysis) => summarizeMediaAnalysis(analysis)),
    });
  }
}
