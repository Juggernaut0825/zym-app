/* eslint-disable no-console */
/**
 * Mirror free-exercise-db (https://github.com/yuhonas/free-exercise-db) demo images into our
 * GCS public bucket so the iOS/Web clients load them through our CDN rather than GitHub raw.
 *
 * For each of the ~873 exercises we expect 2 jpg images, giving ~1746 objects under
 * gs://zymapp-491715-public-media/exercises/<external_id>/<n>.jpg
 *
 * Idempotent: skips an upload when the destination object already exists.
 *
 * Run (locally, with Application Default Credentials):
 *   gcloud auth application-default login
 *   cd server
 *   npx tsx scripts/mirror-free-exercise-db-images-to-gcs.ts
 *
 * Env:
 *   FREE_EXERCISE_DB_JSON_URL   Override dataset JSON URL (default github main dist/exercises.json).
 *   FREE_EXERCISE_DB_RAW_BASE   Override raw image base URL.
 *   EXERCISE_IMAGES_BUCKET      GCS bucket name (default zymapp-491715-public-media).
 *   EXERCISE_IMAGES_PREFIX      Object key prefix (default "exercises").
 *   MIRROR_CONCURRENCY          Concurrent uploads (default 12).
 *   MIRROR_DRY_RUN              Set to "1" to skip uploads (just print plan).
 *   MIRROR_FORCE                Set to "1" to overwrite existing objects.
 */

import 'dotenv/config';
import { Storage } from '@google-cloud/storage';

interface FreeExerciseDbItem {
  id: string;
  name: string;
  images: string[];
}

const JSON_URL = process.env.FREE_EXERCISE_DB_JSON_URL
  || 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const RAW_BASE = (process.env.FREE_EXERCISE_DB_RAW_BASE
  || 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises').replace(/\/$/, '');
const BUCKET_NAME = process.env.EXERCISE_IMAGES_BUCKET || 'zymapp-491715-public-media';
const KEY_PREFIX = (process.env.EXERCISE_IMAGES_PREFIX || 'exercises').replace(/^\/+|\/+$/g, '');
const CONCURRENCY = Math.max(1, Math.min(32, Number(process.env.MIRROR_CONCURRENCY || 12)));
const DRY_RUN = String(process.env.MIRROR_DRY_RUN || '').trim() === '1';
const FORCE = String(process.env.MIRROR_FORCE || '').trim() === '1';

interface UploadTask {
  externalId: string;
  relativePath: string;       // e.g. "3_4_Sit-Up/0.jpg"
  sourceUrl: string;
  objectKey: string;          // e.g. "exercises/3_4_Sit-Up/0.jpg"
}

async function fetchDataset(): Promise<FreeExerciseDbItem[]> {
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

function buildTasks(items: FreeExerciseDbItem[]): UploadTask[] {
  const tasks: UploadTask[] = [];
  for (const item of items) {
    const externalId = String(item.id || '').trim();
    if (!externalId) continue;
    const images = Array.isArray(item.images) ? item.images : [];
    for (const relativePath of images) {
      const cleaned = String(relativePath || '').trim().replace(/^\/+/, '');
      if (!cleaned) continue;
      tasks.push({
        externalId,
        relativePath: cleaned,
        sourceUrl: `${RAW_BASE}/${cleaned}`,
        objectKey: `${KEY_PREFIX}/${cleaned}`,
      });
    }
  }
  return tasks;
}

async function fetchBinary(url: string, attempt = 0): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (response.status === 429 && attempt < 4) {
    const backoff = 1500 * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, backoff));
    return fetchBinary(url, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`empty payload for ${url}`);
  }
  return buffer;
}

async function runWorker(
  storage: Storage,
  queue: UploadTask[],
  counters: { uploaded: number; skipped: number; failed: number; processed: number; total: number },
): Promise<void> {
  while (true) {
    const task = queue.shift();
    if (!task) return;
    counters.processed += 1;
    try {
      const file = storage.bucket(BUCKET_NAME).file(task.objectKey);
      if (!FORCE) {
        const [exists] = await file.exists();
        if (exists) {
          counters.skipped += 1;
          if (counters.processed % 100 === 0) {
            console.log(`  [${counters.processed}/${counters.total}] skip+upload=${counters.skipped}+${counters.uploaded}, failed=${counters.failed}`);
          }
          continue;
        }
      }
      if (DRY_RUN) {
        counters.uploaded += 1;
        continue;
      }
      const body = await fetchBinary(task.sourceUrl);
      await file.save(body, {
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000, immutable',
        },
        resumable: false,
      });
      counters.uploaded += 1;
    } catch (error) {
      counters.failed += 1;
      console.warn(`  fail ${task.objectKey}: ${(error as Error).message}`);
    }
    if (counters.processed % 100 === 0) {
      console.log(`  [${counters.processed}/${counters.total}] skip+upload=${counters.skipped}+${counters.uploaded}, failed=${counters.failed}`);
    }
  }
}

async function main() {
  console.log(`Source dataset: ${JSON_URL}`);
  console.log(`Image source base: ${RAW_BASE}`);
  console.log(`Destination: gs://${BUCKET_NAME}/${KEY_PREFIX}/`);
  console.log(`Concurrency: ${CONCURRENCY}${DRY_RUN ? ' (DRY RUN)' : ''}${FORCE ? ' (FORCE overwrite)' : ''}`);

  console.log('Fetching dataset ...');
  const dataset = await fetchDataset();
  console.log(`Got ${dataset.length} exercises.`);

  const tasks = buildTasks(dataset);
  console.log(`Planned ${tasks.length} image uploads.`);

  const storage = new Storage({
    projectId: process.env.MEDIA_STORAGE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'zymapp-491715',
    keyFilename: process.env.MEDIA_STORAGE_KEY_FILE || undefined,
  });

  // Sanity check: bucket must exist and be reachable.
  const [bucketExists] = await storage.bucket(BUCKET_NAME).exists();
  if (!bucketExists) {
    throw new Error(`Bucket gs://${BUCKET_NAME} not found or not accessible.`);
  }

  const counters = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
    processed: 0,
    total: tasks.length,
  };

  const queue = tasks.slice();
  const workers = Array.from({ length: CONCURRENCY }, () => runWorker(storage, queue, counters));
  await Promise.all(workers);

  console.log('---');
  console.log(`Done. uploaded=${counters.uploaded}, skipped=${counters.skipped}, failed=${counters.failed}, total=${counters.total}`);
  if (counters.failed > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error('mirror-free-exercise-db-images-to-gcs failed:', error);
  process.exit(1);
});
