/* eslint-disable no-console */
/**
 * Pull exercises from the ExerciseDB API (https://oss.exercisedb.dev) into our
 * exercise_library_v2 table, generate embeddings via VectorService, and upsert.
 *
 * Run:
 *   cd server
 *   npm run build && node dist/scripts/pull-exercises.js
 *
 * Or with tsx (dev):
 *   cd server
 *   npx tsx scripts/pull-exercises.ts
 *
 * Env:
 *   OPENROUTER_API_KEY      Required to generate embeddings.
 *   EXERCISEDB_API_BASE     Override default API base URL.
 *   EXERCISEDB_PAGE_LIMIT   Override page size (default 100).
 *   EXERCISEDB_MAX_PAGES    Cap number of pages (default 50).
 *   EXERCISE_PULL_SKIP_EMBEDDINGS  Set to "1" to skip embedding step.
 */

import 'dotenv/config';
import { getDB, initDB } from '../src/database/runtime-db.js';
import { ExerciseSearchService } from '../src/services/exercise-search-service.js';
import { VectorService } from '../src/services/vector-service.js';

interface ExerciseDbItem {
  exerciseId?: string;
  id?: string;
  name: string;
  gifUrl?: string;
  videoUrl?: string;
  imageUrls?: string[];
  bodyPart?: string;
  bodyParts?: string[];
  target?: string;
  targetMuscle?: string;
  targetMuscles?: string[];
  equipment?: string;
  equipments?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
}

interface ExerciseDbResponse {
  success?: boolean;
  data?: ExerciseDbItem[];
  exercises?: ExerciseDbItem[];
  meta?: { total?: number; hasNextPage?: boolean; nextCursor?: string };
  metadata?: { totalPages?: number; totalExercises?: number };
}

const API_BASE = (process.env.EXERCISEDB_API_BASE || 'https://oss.exercisedb.dev/api/v1').replace(/\/$/, '');
const PAGE_LIMIT = Math.min(25, Number(process.env.EXERCISEDB_PAGE_LIMIT || 25));
const MAX_PAGES = Number(process.env.EXERCISEDB_MAX_PAGES || 80);
const SKIP_EMBEDDINGS = String(process.env.EXERCISE_PULL_SKIP_EMBEDDINGS || '').trim() === '1';

function normaliseItem(item: ExerciseDbItem) {
  const externalId = String(item.exerciseId || item.id || '').trim();
  const name = String(item.name || '').trim();
  if (!externalId || !name) return null;
  const bodyPart = item.bodyPart || item.bodyParts?.[0] || null;
  const targetMuscle = item.targetMuscle || item.target || item.targetMuscles?.[0] || null;
  const equipment = item.equipment || item.equipments?.[0] || null;
  const secondaryMuscles = Array.isArray(item.secondaryMuscles)
    ? item.secondaryMuscles.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  const instructions = Array.isArray(item.instructions)
    ? item.instructions.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const imageUrls = Array.isArray(item.imageUrls)
    ? item.imageUrls.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  return {
    externalId,
    name,
    bodyPart: bodyPart || null,
    targetMuscle: targetMuscle || null,
    equipment: equipment || null,
    secondaryMuscles,
    instructions,
    gifUrl: item.gifUrl ? String(item.gifUrl).trim() : null,
    videoUrl: item.videoUrl ? String(item.videoUrl).trim() : null,
    imageUrls,
  };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(cursor: string | null, limit: number, attempt = 0): Promise<{ items: ExerciseDbItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('after', cursor);
  const url = `${API_BASE}/exercises?${params.toString()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 429 && attempt < 5) {
    const backoff = Math.min(30_000, 1500 * Math.pow(2, attempt));
    console.log(`  rate limited, retrying in ${Math.round(backoff / 1000)}s`);
    await sleep(backoff);
    return fetchPage(cursor, limit, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`ExerciseDB fetch failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as ExerciseDbResponse | ExerciseDbItem[];
  if (Array.isArray(body)) return { items: body, nextCursor: null };
  const items = Array.isArray(body.data) ? body.data : (Array.isArray(body.exercises) ? body.exercises : []);
  const nextCursor = body.meta?.hasNextPage && body.meta.nextCursor ? String(body.meta.nextCursor) : null;
  return { items, nextCursor };
}

async function fetchAll(): Promise<ExerciseDbItem[]> {
  const out: ExerciseDbItem[] = [];
  let cursor: string | null = null;
  const delayMs = Number(process.env.EXERCISEDB_REQUEST_DELAY_MS || 700);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    process.stdout.write(`Fetching page ${page + 1} (cursor=${cursor || 'start'}) ... `);
    const { items, nextCursor } = await fetchPage(cursor, PAGE_LIMIT);
    console.log(`got ${items.length}`);
    if (items.length === 0) break;
    out.push(...items);
    if (!nextCursor) break;
    cursor = nextCursor;
    if (delayMs > 0) await sleep(delayMs);
  }
  return out;
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
  console.log(`Fetching exercises from ${API_BASE} ...`);
  const rawItems = await fetchAll();
  console.log(`Fetched ${rawItems.length} exercises.`);

  const normalised = rawItems
    .map(normaliseItem)
    .filter((item): item is NonNullable<ReturnType<typeof normaliseItem>> => Boolean(item));
  console.log(`Normalised ${normalised.length} exercises.`);

  const searchTexts = normalised.map((item) =>
    ExerciseSearchService.buildSearchText({
      name: item.name,
      bodyPart: item.bodyPart,
      targetMuscle: item.targetMuscle,
      equipment: item.equipment,
      secondaryMuscles: item.secondaryMuscles,
      instructions: item.instructions,
    }),
  );

  console.log('Generating embeddings ...');
  const embeddings = await generateEmbeddingsInBatches(searchTexts);

  const db = getDB();
  const insertStmt = db.prepare(`
    INSERT INTO exercise_library_v2
      (external_id, name, body_part, target_muscle, equipment, secondary_muscles, instructions, gif_url, video_url, image_urls, embedding, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      name = excluded.name,
      body_part = excluded.body_part,
      target_muscle = excluded.target_muscle,
      equipment = excluded.equipment,
      secondary_muscles = excluded.secondary_muscles,
      instructions = excluded.instructions,
      gif_url = excluded.gif_url,
      video_url = excluded.video_url,
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
        item.bodyPart,
        item.targetMuscle,
        item.equipment,
        JSON.stringify(item.secondaryMuscles),
        JSON.stringify(item.instructions),
        item.gifUrl,
        item.videoUrl,
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
  console.error('pull-exercises failed:', error);
  process.exit(1);
});
