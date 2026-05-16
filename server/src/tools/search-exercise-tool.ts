import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { ExerciseSearchService } from '../services/exercise-search-service.js';
import { toJson } from './base-tool-helpers.js';

export class SearchExerciseTool implements Tool {
  definition: ToolDefinition = {
    name: 'search_exercise',
    description:
      'Semantic search over the in-house exercise library (with demo media). Returns the top matching exercises so you can pick the ones to include in a training plan. Each result includes an exercise_key you should pass to set_training_plan so demo media renders for the user.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural-language description of the movement, muscle group, or training intent (for example, "horizontal push for chest" or "single-leg knee dominant for quads"). Be specific about target muscle, movement pattern, and equipment when relevant.',
          minLength: 2,
          maxLength: 240,
        },
        body_part: {
          type: 'string',
          description: 'Optional body-part filter, for example chest, back, upper legs, lower legs, shoulders, upper arms, lower arms, waist, cardio.',
          maxLength: 40,
        },
        equipment: {
          type: 'string',
          description: 'Optional equipment filter, for example barbell, dumbbell, body weight, cable, kettlebell, leverage machine, smith machine.',
          maxLength: 40,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default 10, max 20).',
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
    },
  };

  async execute(args: any, _context: ToolExecutionContext): Promise<string> {
    const query = String(args?.query || '').trim();
    if (!query) {
      return toJson({ error: 'query is required' });
    }
    const limit = Math.max(1, Math.min(20, Math.floor(Number(args?.limit || 10))));
    const bodyPart = args?.body_part ? String(args.body_part).trim() : undefined;
    const equipment = args?.equipment ? String(args.equipment).trim() : undefined;

    const results = await ExerciseSearchService.search(query, {
      limit,
      bodyPart,
      equipment,
    });

    return toJson({
      query,
      bodyPart: bodyPart || null,
      equipment: equipment || null,
      count: results.length,
      libraryEmpty: ExerciseSearchService.count() === 0,
      results: results.map((row) => ({
        exercise_key: row.externalId,
        name: row.name,
        body_part: row.bodyPart,
        target_muscle: row.targetMuscle,
        equipment: row.equipment,
        secondary_muscles: row.secondaryMuscles,
        instructions: row.instructions.slice(0, 4),
        gif_url: row.gifUrl,
        video_url: row.videoUrl,
        image_count: row.imageUrls.length,
        score: Number(row.score.toFixed(4)),
      })),
    });
  }
}
