import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { ExerciseSearchService } from '../services/exercise-search-service.js';
import { toJson } from './base-tool-helpers.js';

export class SearchExerciseTool implements Tool {
  definition: ToolDefinition = {
    name: 'search_exercise',
    description:
      'Semantic search over the in-house exercise library (with demo images). Returns the top matching exercises so you can pick the ones to include in a training plan. Each result includes an exercise_key you should pass to set_training_plan so demo media renders for the user.',
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
        primary_muscle: {
          type: 'string',
          description:
            'Optional primary-muscle filter. Common values include: chest, lats, middle back, lower back, shoulders, traps, neck, biceps, triceps, forearms, abdominals, quadriceps, hamstrings, glutes, calves, abductors, adductors.',
          maxLength: 40,
        },
        category: {
          type: 'string',
          description:
            'Optional category filter. One of: strength, stretching, plyometrics, powerlifting, cardio, olympic weightlifting, strongman.',
          maxLength: 40,
        },
        level: {
          type: 'string',
          description: 'Optional difficulty filter. One of: beginner, intermediate, expert.',
          maxLength: 20,
        },
        equipment: {
          type: 'string',
          description:
            'Optional equipment filter. Common values include: barbell, dumbbell, body only, cable, machine, kettlebells, bands, medicine ball, exercise ball, foam roll, e-z curl bar, other.',
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
    const primaryMuscle = args?.primary_muscle ? String(args.primary_muscle).trim() : undefined;
    const category = args?.category ? String(args.category).trim() : undefined;
    const level = args?.level ? String(args.level).trim() : undefined;
    const equipment = args?.equipment ? String(args.equipment).trim() : undefined;

    const results = await ExerciseSearchService.search(query, {
      limit,
      primaryMuscle,
      category,
      level,
      equipment,
    });

    return toJson({
      query,
      primary_muscle: primaryMuscle || null,
      category: category || null,
      level: level || null,
      equipment: equipment || null,
      count: results.length,
      libraryEmpty: ExerciseSearchService.count() === 0,
      results: results.map((row) => ({
        exercise_key: row.externalId,
        name: row.name,
        primary_muscles: row.primaryMuscles,
        secondary_muscles: row.secondaryMuscles,
        category: row.category,
        level: row.level,
        force: row.force,
        mechanic: row.mechanic,
        equipment: row.equipment,
        instructions: row.instructions.slice(0, 4),
        image_count: row.imageUrls.length,
        score: Number(row.score.toFixed(4)),
      })),
    });
  }
}
