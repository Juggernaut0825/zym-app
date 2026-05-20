/* eslint-disable no-console */
/**
 * Pull exercises from free-exercise-db (https://github.com/yuhonas/free-exercise-db, Unlicense)
 * into our exercise_library_v2 table, generate embeddings via VectorService, and upsert.
 *
 * Run:
 *   cd server
 *   npx tsx scripts/pull-free-exercise-db.ts
 *
 * Or after build:
 *   cd server
 *   npm run build && node dist/scripts/pull-free-exercise-db.js
 *
 * Env:
 *   OPENROUTER_API_KEY               Required to generate embeddings (skip with EXERCISE_PULL_SKIP_EMBEDDINGS=1).
 *   FREE_EXERCISE_DB_JSON_URL        Override dataset JSON URL.
 *   EXERCISE_IMAGE_BASE_URL          Base URL prepended to image relative paths.
 *                                    Default: https://storage.googleapis.com/zymapp-491715-public-media/exercises
 *                                    Set to the GitHub raw URL for a no-mirror local run:
 *                                    https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises
 *   EXERCISE_PULL_SKIP_EMBEDDINGS    Set to "1" to skip embedding step (DB will store NULL embeddings).
 */

import 'dotenv/config';
import { getDB, initDB } from '../src/database/runtime-db.js';
import { ExerciseSearchService } from '../src/services/exercise-search-service.js';
import { VectorService } from '../src/services/vector-service.js';

interface FreeExerciseDbItem {
  id: string;
  name: string;
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  category?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  images?: string[];
}

const JSON_URL = process.env.FREE_EXERCISE_DB_JSON_URL
  || 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMAGE_BASE_URL = (process.env.EXERCISE_IMAGE_BASE_URL
  || 'https://storage.googleapis.com/zymapp-491715-public-media/exercises').replace(/\/$/, '');
const SKIP_EMBEDDINGS = String(process.env.EXERCISE_PULL_SKIP_EMBEDDINGS || '').trim() === '1';

interface NormalisedExercise {
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
}

function cleanString(value: unknown): string {
  return String(value || '').trim();
}

function cleanArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normaliseItem(item: FreeExerciseDbItem): NormalisedExercise | null {
  const externalId = cleanString(item.id);
  const name = cleanString(item.name);
  if (!externalId || !name) return null;

  // `level` is NOT NULL in our schema; fall back to "beginner" rather than rejecting the row.
  const level = cleanString(item.level) || 'beginner';
  const category = cleanString(item.category) || 'strength';

  const imageUrls = cleanArray(item.images).map((rel) => {
    if (/^https?:\/\//i.test(rel)) return rel;
    return `${IMAGE_BASE_URL}/${rel.replace(/^\/+/, '')}`;
  });

  return {
    externalId,
    name,
    force: cleanString(item.force) || null,
    level,
    mechanic: cleanString(item.mechanic) || null,
    equipment: cleanString(item.equipment) || null,
    category,
    primaryMuscles: cleanArray(item.primaryMuscles),
    secondaryMuscles: cleanArray(item.secondaryMuscles),
    instructions: cleanArray(item.instructions),
    imageUrls,
  };
}

async function fetchDataset(): Promise<FreeExerciseDbItem[]> {
  console.log(`Fetching dataset from ${JSON_URL} ...`);
  const response = await fetch(JSON_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as FreeExerciseDbItem[];
  if (!Array.isArray(body)) {
    throw new Error('Dataset response was not a JSON array');
  }
  return body;
}

async function generateEmbeddingsInBatches(texts: string[]): Promise<number[][]> {
  if (SKIP_EMBEDDINGS) return texts.map(() => []);
  const BATCH = 32;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    try {
      const embeddings = await VectorService.getEmbeddings(slice);
      for (let j = 0; j < slice.length; j += 1) {
        out.push(Array.isArray(embeddings[j]) ? embeddings[j] : []);
      }
      console.log(`  embeddings ${i + slice.length}/${texts.length}`);
    } catch (error) {
      console.warn('Embedding batch failed, continuing with empty vectors:', error);
      for (let j = 0; j < slice.length; j += 1) out.push([]);
    }
  }
  return out;
}

async function main() {
  await initDB();
  console.log(`Image base URL: ${IMAGE_BASE_URL}`);
  console.log(`Skip embeddings: ${SKIP_EMBEDDINGS}`);

  const rawItems = await fetchDataset();
  console.log(`Fetched ${rawItems.length} exercises.`);

  const normalised = rawItems
    .map(normaliseItem)
    .filter((item): item is NormalisedExercise => Boolean(item));
  console.log(`Normalised ${normalised.length} exercises.`);

  const searchTexts = normalised.map((item) =>
    ExerciseSearchService.buildSearchText({
      name: item.name,
      force: item.force,
      level: item.level,
      mechanic: item.mechanic,
      equipment: item.equipment,
      category: item.category,
      primaryMuscles: item.primaryMuscles,
      secondaryMuscles: item.secondaryMuscles,
      instructions: item.instructions,
    }),
  );

  console.log('Generating embeddings ...');
  const embeddings = await generateEmbeddingsInBatches(searchTexts);

  const db = getDB();
  const insertStmt = db.prepare(`
    INSERT INTO exercise_library_v2
      (external_id, name, force, level, mechanic, equipment, category,
       primary_muscles, secondary_muscles, instructions, image_urls, embedding, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      name = excluded.name,
      force = excluded.force,
      level = excluded.level,
      mechanic = excluded.mechanic,
      equipment = excluded.equipment,
      category = excluded.category,
      primary_muscles = excluded.primary_muscles,
      secondary_muscles = excluded.secondary_muscles,
      instructions = excluded.instructions,
      image_urls = excluded.image_urls,
      embedding = excluded.embedding,
      search_text = excluded.search_text,
      updated_at = CURRENT_TIMESTAMP
  `);

  let inserted = 0;
  for (let i = 0; i < normalised.length; i += 1) {
    const item = normalised[i];
    const embedding = embeddings[i] || [];
    try {
      insertStmt.run(
        item.externalId,
        item.name,
        item.force,
        item.level,
        item.mechanic,
        item.equipment,
        item.category,
        JSON.stringify(item.primaryMuscles),
        JSON.stringify(item.secondaryMuscles),
        JSON.stringify(item.instructions),
        JSON.stringify(item.imageUrls),
        embedding.length > 0 ? JSON.stringify(embedding) : null,
        searchTexts[i],
      );
      inserted += 1;
    } catch (error) {
      console.warn(`Failed to upsert ${item.externalId}:`, error);
    }
  }

  console.log(`Upserted ${inserted}/${normalised.length} exercises.`);
  const total = ExerciseSearchService.count();
  console.log(`exercise_library_v2 now contains ${total} rows.`);
}

main().catch((error) => {
  console.error('pull-free-exercise-db failed:', error);
  process.exit(1);
});
