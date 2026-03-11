import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';

function requireUserId(context: ToolExecutionContext): string {
  const userId = String(context.userId || '').trim();
  if (!/^\d+$/.test(userId)) {
    throw new Error('Missing authenticated user context for tool execution');
  }
  return userId;
}

function toJson(output: unknown): string {
  return JSON.stringify(output, null, 2);
}

export class GetContextTool implements Tool {
  definition: ToolDefinition = {
    name: 'get_context',
    description: 'Read session context, pinned facts, and recent messages for the current user.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Context scope: summary, recent, or full.',
          enum: ['summary', 'recent', 'full'],
        },
        limit: {
          type: 'integer',
          description: 'Maximum recent messages to include when scope is recent.',
          minimum: 1,
          maximum: 24,
        },
      },
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.getContext(userId, {
      scope: args?.scope,
      limit: args?.limit,
    });
    return toJson(result);
  }
}

export class GetProfileTool implements Tool {
  definition: ToolDefinition = {
    name: 'get_profile',
    description: 'Read the current user profile values and derived metrics.',
    parameters: {
      type: 'object',
      properties: {},
    },
  };

  async execute(_: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.getProfile(userId);
    return toJson(result);
  }
}

export class SetProfileTool implements Tool {
  definition: ToolDefinition = {
    name: 'set_profile',
    description: 'Update user profile fields (height, weight, age, gender, activity, goal, etc.) with validation.',
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

export class ListRecentMediaTool implements Tool {
  definition: ToolDefinition = {
    name: 'list_recent_media',
    description: 'List recent uploaded media IDs available for inspection.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of media records to return.',
          minimum: 1,
          maximum: 20,
        },
        activeOnly: {
          type: 'boolean',
          description: 'If true, return only currently active media.',
        },
      },
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.listRecentMedia(userId, {
      limit: args?.limit,
      activeOnly: args?.activeOnly,
    });
    return toJson(result);
  }
}

export class InspectMediaTool implements Tool {
  definition: ToolDefinition = {
    name: 'inspect_media',
    description: 'Run structured evidence-based inspection on an uploaded media item.',
    parameters: {
      type: 'object',
      properties: {
        mediaId: {
          type: 'string',
          description: 'Media ID (med_...) to inspect.',
          minLength: 8,
          maxLength: 128,
          pattern: '^med_[a-zA-Z0-9._-]{4,120}$',
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

export class LogMealTool implements Tool {
  definition: ToolDefinition = {
    name: 'log_meal',
    description: 'Estimate and log meal nutrition into daily records with date/time awareness.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Meal description in natural language.',
          minLength: 2,
          maxLength: 500,
        },
        localDate: {
          type: 'string',
          description: 'Optional local date bucket (YYYY-MM-DD) for backfill logs.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        occurredAt: {
          type: 'string',
          description: 'Optional ISO datetime when the meal happened.',
          maxLength: 60,
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone like America/New_York.',
          minLength: 3,
          maxLength: 80,
        },
      },
      required: ['description'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.logMeal(
      userId,
      String(args?.description || ''),
      {
        localDate: args?.localDate,
        occurredAt: args?.occurredAt,
        timezone: args?.timezone,
      },
    );
    return toJson(result);
  }
}

export class LogTrainingTool implements Tool {
  definition: ToolDefinition = {
    name: 'log_training',
    description: 'Log structured training entries into daily records with date/time awareness.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          description: 'Array of training entries with fields like name, sets, reps, weight_kg.',
        },
        localDate: {
          type: 'string',
          description: 'Optional local date bucket (YYYY-MM-DD) for backfill logs.',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        occurredAt: {
          type: 'string',
          description: 'Optional ISO datetime when the workout happened.',
          maxLength: 60,
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone like America/New_York.',
          minLength: 3,
          maxLength: 80,
        },
      },
      required: ['entries'],
    },
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const userId = requireUserId(context);
    const result = await coachTypedToolsService.logTraining(
      userId,
      args?.entries,
      {
        localDate: args?.localDate,
        occurredAt: args?.occurredAt,
        timezone: args?.timezone,
      },
    );
    return toJson(result);
  }
}

export class SearchKnowledgeTool implements Tool {
  definition: ToolDefinition = {
    name: 'search_knowledge',
    description: 'Search grounded professional knowledge from local/vector KB with ranking.',
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
          type: 'string',
          description: 'Domain filter: fitness, nutrition, or both.',
          enum: ['fitness', 'nutrition', 'both'],
        },
        topK: {
          type: 'integer',
          description: 'Max number of matches.',
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

  async execute(args: any): Promise<string> {
    const result = await coachTypedToolsService.searchKnowledge({
      query: args?.query,
      domains: args?.domains,
      topK: args?.topK,
      minScore: args?.minScore,
    });
    return toJson(result);
  }
}
