import { getDB } from '../database/runtime-db.js';
import { VectorService } from './vector-service.js';
import { logger } from '../utils/logger.js';

/**
 * Schema sourced from https://github.com/yuhonas/free-exercise-db (Unlicense).
 * - `category` is the high-level kind of movement (strength, cardio, stretching, plyometrics, etc.).
 * - `level` and `mechanic` give the AI room to balance difficulty and compound/isolation ratios.
 * - `primaryMuscles` is an array (most exercises have a single primary muscle, e.g. ["chest"]); we
 *   use index 0 when surfacing a single-value field to the iOS/Web clients via the hydrate layer.
 */
export interface ExerciseLibraryRow {
  id: number;
  externalId: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  imageUrls: string[];
  searchText: string;
}

export interface ExerciseSearchResult extends ExerciseLibraryRow {
  score: number;
}

export interface ExerciseSearchOptions {
  limit?: number;
  primaryMuscle?: string;
  category?: string;
  level?: string;
  equipment?: string;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
  } catch {
    return [];
  }
  return [];
}

function parseEmbedding(value: unknown): number[] {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => Number(item) || 0);
    }
  } catch {
    return [];
  }
  return [];
}

function rowToLibraryRow(row: Record<string, unknown>): ExerciseLibraryRow {
  return {
    id: Number(row.id) || 0,
    externalId: String(row.external_id || ''),
    name: String(row.name || ''),
    force: row.force ? String(row.force) : null,
    level: String(row.level || 'beginner'),
    mechanic: row.mechanic ? String(row.mechanic) : null,
    equipment: row.equipment ? String(row.equipment) : null,
    category: String(row.category || 'strength'),
    primaryMuscles: parseJsonArray(row.primary_muscles),
    secondaryMuscles: parseJsonArray(row.secondary_muscles),
    instructions: parseJsonArray(row.instructions),
    imageUrls: parseJsonArray(row.image_urls),
    searchText: String(row.search_text || row.name || ''),
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function keywordScore(query: string, row: ExerciseLibraryRow): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return 0;
  const haystack = [
    row.name,
    row.category,
    row.level,
    row.force || '',
    row.mechanic || '',
    row.equipment || '',
    row.primaryMuscles.join(' '),
    row.secondaryMuscles.join(' '),
    row.searchText,
  ].join(' ');
  const haystackTokens = new Set(tokenize(haystack));
  let overlap = 0;
  for (const token of queryTokens) {
    if (haystackTokens.has(token)) overlap += 1;
  }
  return overlap / queryTokens.size;
}

const EXERCISE_COLUMNS =
  'id, external_id, name, force, level, mechanic, equipment, category, primary_muscles, secondary_muscles, instructions, image_urls, search_text';

export class ExerciseSearchService {
  static buildSearchText(parts: {
    name?: string | null;
    force?: string | null;
    level?: string | null;
    mechanic?: string | null;
    equipment?: string | null;
    category?: string | null;
    primaryMuscles?: string[] | null;
    secondaryMuscles?: string[] | null;
    instructions?: string[] | null;
  }): string {
    const pieces: string[] = [];
    if (parts.name) pieces.push(parts.name);
    if (parts.primaryMuscles?.length) pieces.push(`Primary muscles: ${parts.primaryMuscles.join(', ')}`);
    if (parts.secondaryMuscles?.length) pieces.push(`Secondary muscles: ${parts.secondaryMuscles.join(', ')}`);
    if (parts.category) pieces.push(`Category: ${parts.category}`);
    if (parts.equipment) pieces.push(`Equipment: ${parts.equipment}`);
    if (parts.level) pieces.push(`Level: ${parts.level}`);
    if (parts.force) pieces.push(`Force: ${parts.force}`);
    if (parts.mechanic) pieces.push(`Mechanic: ${parts.mechanic}`);
    if (parts.instructions?.length) pieces.push(parts.instructions.slice(0, 2).join(' '));
    return pieces.join('. ');
  }

  static count(): number {
    try {
      const row = getDB().prepare('SELECT COUNT(1) AS count FROM exercise_library_v2').get() as { count?: number } | undefined;
      return Number(row?.count || 0);
    } catch {
      return 0;
    }
  }

  static getByExternalId(externalId: string): ExerciseLibraryRow | null {
    const id = String(externalId || '').trim();
    if (!id) return null;
    try {
      const row = getDB().prepare(`
        SELECT ${EXERCISE_COLUMNS}
        FROM exercise_library_v2 WHERE external_id = ? LIMIT 1
      `).get(id) as Record<string, unknown> | undefined;
      if (!row) return null;
      return rowToLibraryRow(row);
    } catch {
      return null;
    }
  }

  static getByName(name: string): ExerciseLibraryRow | null {
    const value = String(name || '').trim().toLowerCase();
    if (!value) return null;
    try {
      const row = getDB().prepare(`
        SELECT ${EXERCISE_COLUMNS}
        FROM exercise_library_v2 WHERE LOWER(name) = ? LIMIT 1
      `).get(value) as Record<string, unknown> | undefined;
      if (!row) return null;
      return rowToLibraryRow(row);
    } catch {
      return null;
    }
  }

  static async search(
    query: string,
    options: ExerciseSearchOptions = {},
  ): Promise<ExerciseSearchResult[]> {
    const limit = Math.max(1, Math.min(20, Math.floor(options.limit || 10)));
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await VectorService.getEmbedding(trimmed);
    } catch (error) {
      logger.warn('[exercise-search] embedding request failed; falling back to keyword scoring', error);
      queryEmbedding = [];
    }

    const filters: string[] = [];
    const params: unknown[] = [];

    // `primary_muscles` is a JSON array stored as TEXT, so we use LIKE for portability between
    // Postgres and SQLite. Wrapping in quotes prevents matching substrings like "lats" inside "lateral".
    if (options.primaryMuscle) {
      filters.push('LOWER(primary_muscles) LIKE ?');
      params.push(`%"${String(options.primaryMuscle).toLowerCase()}"%`);
    }
    if (options.category) {
      filters.push('LOWER(category) = ?');
      params.push(String(options.category).toLowerCase());
    }
    if (options.level) {
      filters.push('LOWER(level) = ?');
      params.push(String(options.level).toLowerCase());
    }
    if (options.equipment) {
      filters.push('LOWER(equipment) = ?');
      params.push(String(options.equipment).toLowerCase());
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    let rows: Array<Record<string, unknown>> = [];
    try {
      rows = getDB().prepare(`
        SELECT ${EXERCISE_COLUMNS}, embedding
        FROM exercise_library_v2
        ${whereClause}
        LIMIT 2000
      `).all(...params) as Array<Record<string, unknown>>;
    } catch (error) {
      logger.warn('[exercise-search] query failed', error);
      return [];
    }

    if (rows.length === 0) return [];

    const useEmbedding = queryEmbedding.length > 0;
    const scored: ExerciseSearchResult[] = rows.map((row) => {
      const libraryRow = rowToLibraryRow(row);
      let score = 0;
      if (useEmbedding) {
        const rowEmbedding = parseEmbedding(row.embedding);
        if (rowEmbedding.length > 0) {
          score = cosineSimilarity(queryEmbedding, rowEmbedding);
        } else {
          score = 0.15 * keywordScore(trimmed, libraryRow);
        }
      } else {
        score = keywordScore(trimmed, libraryRow);
      }
      return { ...libraryRow, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).filter((item) => item.score > 0);
  }
}
