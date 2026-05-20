/* eslint-disable no-console */
/**
 * End-to-end smoke test for the coach agent pipeline.
 *
 *   - Wires up a real ConversationRunner + ToolManager (same as production)
 *   - Lets the LLM choose its own tools given a single user prompt
 *   - Asserts the AI invoked `search_exercise` and `set_training_plan`
 *   - Asserts the resulting plan carries GCS demo URLs (mirroring + hydrate working)
 *
 * Run:
 *   cd server
 *   npx tsx scripts/smoke-test-coach-pipeline.ts
 *
 * Env: OPENROUTER_API_KEY (required). Uses local SQLite, no production traffic.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { initDB } from '../src/database/runtime-db.js';
import { AIService } from '../src/utils/ai-service.js';
import { ToolManager } from '../src/tools/tool-manager.js';
import { ConversationRunner } from '../src/core/conversation-runner.js';
import type { Message, ToolExecutionContext } from '../src/types/index.js';
import { ExerciseSearchService } from '../src/services/exercise-search-service.js';

const SANDBOX_USER_ID = '999000';
const SANDBOX_ROOT = path.join('/tmp', 'zym-coach-smoke-test');

const SYSTEM_PROMPT = `You are LC, a strict but fair fitness coach. The user just sent a request.

Operating instructions:
- For any "plan a workout" request, you MUST first call \`search_exercise\` (one or more times)
  to look up real exercises with demo images. Use the \`exercise_key\` returned in the result
  when you call \`set_training_plan\` so the demo media renders for the user.
- After choosing 4-6 exercises, call \`set_training_plan\` exactly once with the full plan.
- Once the plan is saved, reply to the user with a short confirmation in plain English.
- Do not call any other tools.
- Do not refuse; this is a routine workout-planning task.`;

const USER_PROMPT =
  'Plan a chest and triceps push day for me today. I have access to a barbell and dumbbells, intermediate level. 4-5 exercises is enough.';

interface ToolCallTrace {
  name: string;
  args: any;
  resultPreview: string;
  fullResult: string;
}

async function ensureLibraryReady(): Promise<void> {
  const total = ExerciseSearchService.count();
  console.log(`[smoke] exercise_library_v2 row count: ${total}`);
  if (total === 0) {
    throw new Error('exercise_library_v2 is empty. Run scripts/pull-free-exercise-db.ts first.');
  }
  // Verify embeddings landed.
  const sample = ExerciseSearchService.getByExternalId('Barbell_Bench_Press_-_Medium_Grip');
  console.log(`[smoke] sample row 'Barbell_Bench_Press_-_Medium_Grip' present: ${sample ? 'yes' : 'no'}`);
  if (sample) {
    console.log(`[smoke]   imageUrls[0]: ${sample.imageUrls[0]}`);
  }
}

function prepareSandbox(): { workingDir: string; contextDir: string; sessionFile: string; mediaIndexFile: string } {
  const workingDir = path.join(SANDBOX_ROOT, `user_${SANDBOX_USER_ID}`);
  const contextDir = path.join(workingDir, 'context');
  const sessionsDir = path.join(contextDir, 'sessions');
  fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  const sessionFile = path.join(sessionsDir, 'smoke.json');
  fs.writeFileSync(sessionFile, JSON.stringify({ userId: SANDBOX_USER_ID, activeMediaIds: [], messages: [] }, null, 2));
  const mediaIndexFile = path.join(workingDir, 'media-index.json');
  fs.writeFileSync(mediaIndexFile, JSON.stringify({}, null, 2));
  return { workingDir, contextDir, sessionFile, mediaIndexFile };
}

function summarise(content: string, maxChars = 220): string {
  return content.replace(/\s+/g, ' ').slice(0, maxChars);
}

async function main() {
  console.log('=== ZYM coach agent end-to-end smoke test ===\n');

  await initDB();
  await ensureLibraryReady();

  const sandbox = prepareSandbox();
  console.log(`[smoke] sandbox: ${sandbox.workingDir}\n`);

  const aiService = new AIService({
    usageContext: {
      source: 'smoke_test',
      requestKind: 'chat',
      userId: Number(SANDBOX_USER_ID),
      topic: null,
      metadata: { scenario: 'plan_workout' },
    },
  });

  const toolManager = new ToolManager(sandbox.workingDir, {});
  console.log(`[smoke] registered ${toolManager.getToolDefinitions().length} tools\n`);

  const runner = new ConversationRunner(aiService, toolManager, { maxTurns: 12 });

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: USER_PROMPT },
  ];

  const toolTrace: ToolCallTrace[] = [];
  let lastToolName = '';
  let lastToolArgs: any = null;

  // Patch into runner via onToolStart/onToolEnd. To capture args we wrap executeTool.
  const originalExecute = toolManager.executeTool.bind(toolManager);
  (toolManager as any).executeTool = async (toolCall: any, ctx: any) => {
    lastToolName = toolCall.function.name;
    try { lastToolArgs = JSON.parse(toolCall.function.arguments || '{}'); } catch { lastToolArgs = toolCall.function.arguments; }
    const result = await originalExecute(toolCall, ctx);
    toolTrace.push({
      name: lastToolName,
      args: lastToolArgs,
      resultPreview: summarise(result.content),
      fullResult: result.content,
    });
    return result;
  };

  const context: Partial<ToolExecutionContext> = {
    userId: SANDBOX_USER_ID,
    workingDirectory: sandbox.workingDir,
    dataDirectory: sandbox.workingDir,
    contextDirectory: sandbox.contextDir,
    sessionFile: sandbox.sessionFile,
    mediaIndexFile: sandbox.mediaIndexFile,
    activeMediaIds: [],
    platform: 'smoke-test',
    conversationScope: 'coach_dm',
    allowWriteTools: true,
  };

  console.log(`[smoke] >> user prompt: ${USER_PROMPT}\n`);
  console.log('[smoke] running ConversationRunner...\n');
  const t0 = Date.now();
  const result = await runner.run(messages, {
    onToolStart: (name) => console.log(`[smoke]   tool start: ${name}`),
    onToolEnd: (name) => console.log(`[smoke]   tool end:   ${name}`),
  }, context);
  const elapsedMs = Date.now() - t0;
  console.log(`\n[smoke] done in ${(elapsedMs / 1000).toFixed(1)}s`);

  // -------- assertions --------
  const failures: string[] = [];

  const searchCalls = toolTrace.filter((t) => t.name === 'search_exercise');
  const setPlanCalls = toolTrace.filter((t) => t.name === 'set_training_plan');

  console.log(`\n=== Tool call trace (${toolTrace.length} total) ===`);
  for (let i = 0; i < toolTrace.length; i += 1) {
    const t = toolTrace[i];
    console.log(`  [${i + 1}] ${t.name}`);
    console.log(`      args: ${JSON.stringify(t.args).slice(0, 280)}`);
    console.log(`      result: ${t.resultPreview}`);
  }

  console.log('\n=== Assertions ===');

  const assert = (cond: boolean, label: string) => {
    if (cond) {
      console.log(`  PASS  ${label}`);
    } else {
      console.log(`  FAIL  ${label}`);
      failures.push(label);
    }
  };

  assert(searchCalls.length >= 1, `AI invoked search_exercise (got ${searchCalls.length})`);
  assert(setPlanCalls.length === 1, `AI invoked set_training_plan exactly once (got ${setPlanCalls.length})`);

  // Inspect a search_exercise result.
  if (searchCalls.length > 0) {
    let parsed: any = null;
    try { parsed = JSON.parse(searchCalls[0].fullResult); } catch {}
    const firstResult = parsed?.results?.[0];
    assert(parsed?.libraryEmpty === false, 'search_exercise reports library is populated');
    assert(typeof firstResult?.exercise_key === 'string' && firstResult.exercise_key.length > 0,
      'search_exercise result contains exercise_key');
    assert(typeof firstResult?.image_count === 'number' && firstResult.image_count > 0,
      'search_exercise result reports image_count > 0');
    assert(Array.isArray(firstResult?.primary_muscles) && firstResult.primary_muscles.length > 0,
      'search_exercise result has primary_muscles[]');
    if (firstResult) {
      console.log(`        sample top hit: ${firstResult.exercise_key} (score ${firstResult.score})`);
    }
  }

  // Inspect set_training_plan args + the persisted plan.
  if (setPlanCalls.length > 0) {
    const planArgs = setPlanCalls[0].args;
    const exercises = Array.isArray(planArgs?.exercises) ? planArgs.exercises : [];
    assert(exercises.length >= 4, `plan has at least 4 exercises (got ${exercises.length})`);

    const withKey = exercises.filter((ex: any) => typeof ex?.exercise_key === 'string' && ex.exercise_key.length > 0);
    console.log(`        exercises with exercise_key in plan input: ${withKey.length}/${exercises.length}`);

    // Inspect the persisted plan file. set_training_plan returns { day, timezone, plan: { exercises: [...] } }.
    let parsedResult: any = null;
    try { parsedResult = JSON.parse(setPlanCalls[0].fullResult); } catch {}
    const persistedExercises = Array.isArray(parsedResult?.plan?.exercises) ? parsedResult.plan.exercises : [];
    assert(persistedExercises.length >= 4, `persisted plan has at least 4 exercises (got ${persistedExercises.length})`);
    if (persistedExercises.length === 0) {
      console.log('        (no persisted exercises -> downstream demo assertions are vacuously true; skipping)');
      console.log(`        raw set_training_plan response keys: ${parsedResult ? Object.keys(parsedResult).join(',') : '(unparseable)'}`);
      console.log(`        raw plan keys: ${parsedResult?.plan ? Object.keys(parsedResult.plan).join(',') : '(no plan)'}`);
    }

    const withGcsDemo = persistedExercises.filter((ex: any) =>
      typeof ex?.demo_url === 'string' && ex.demo_url.includes('storage.googleapis.com/zymapp-491715-public-media'),
    );
    const withAnyDemo = persistedExercises.filter((ex: any) =>
      typeof ex?.demo_url === 'string' && ex.demo_url.length > 0,
    );
    const withImageList = persistedExercises.filter((ex: any) =>
      Array.isArray(ex?.demo_image_urls) && ex.demo_image_urls.length > 0,
    );
    const withBodyPart = persistedExercises.filter((ex: any) =>
      typeof ex?.body_part === 'string' && ex.body_part.length > 0,
    );

    console.log(`        persisted exercises with demo_url (any):           ${withAnyDemo.length}/${persistedExercises.length}`);
    console.log(`        persisted exercises with demo_url -> GCS:          ${withGcsDemo.length}/${persistedExercises.length}`);
    console.log(`        persisted exercises with demo_image_urls non-empty:${withImageList.length}/${persistedExercises.length}`);
    console.log(`        persisted exercises with body_part set:            ${withBodyPart.length}/${persistedExercises.length}`);

    assert(withAnyDemo.length === persistedExercises.length, 'every persisted exercise has demo_url');
    assert(withGcsDemo.length === persistedExercises.length, 'every persisted demo_url points to GCS mirror');
    assert(withImageList.length === persistedExercises.length, 'every persisted exercise has demo_image_urls[]');
    assert(withBodyPart.length === persistedExercises.length, 'every persisted exercise has body_part filled from primary_muscle');

    // Print first 2 hydrated exercises for human inspection.
    console.log('\n        first 2 hydrated exercises (for eyeball):');
    for (const ex of persistedExercises.slice(0, 2)) {
      console.log(`          - ${ex.name} (key=${ex.exercise_key})`);
      console.log(`              body_part=${ex.body_part} equipment=${ex.equipment} sets=${ex.sets} reps=${ex.reps}`);
      console.log(`              demo_url=${ex.demo_url}`);
      console.log(`              demo_image_urls=${(ex.demo_image_urls || []).slice(0, 2).join(', ')}`);
    }
  }

  // Final reply.
  console.log(`\n=== Final assistant reply ===\n${result.response.slice(0, 800)}`);

  console.log('\n=== Summary ===');
  if (failures.length === 0) {
    console.log(`ALL PASS (${toolTrace.length} tool calls, ${(elapsedMs / 1000).toFixed(1)}s)`);
    process.exit(0);
  } else {
    console.log(`FAILED ${failures.length} assertion(s):`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('smoke test crashed:', error);
  process.exit(2);
});
