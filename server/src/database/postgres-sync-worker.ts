import { parentPort } from 'worker_threads';
import { Pool, types as pgTypes } from 'pg';

if (!parentPort) {
  throw new Error('postgres-sync-worker requires a parent port');
}

type QueryMode = 'get' | 'all' | 'run' | 'exec';

interface WorkerRequest {
  type: 'init' | 'query' | 'close';
  header: SharedArrayBuffer;
  payload: SharedArrayBuffer;
  sql?: string;
  params?: unknown[];
  mode?: QueryMode;
  databaseUrl?: string;
  schemaSql?: string;
  statementTimeoutMs?: number;
}

interface RunResultPayload {
  changes: number;
  lastInsertRowid: number | string | null;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const RESULT_BUFFER_BYTES = 16 * 1024 * 1024;
const SCHEMA_INIT_LOCK_ID = 2_041_022_001;
const RETURNING_ID_TABLES = new Set([
  'users',
  'friendships',
  'groups',
  'messages',
  'posts',
  'post_reactions',
  'health_data',
  'user_sessions',
  'post_comments',
  'mention_notifications',
  'abuse_reports',
  'security_events',
  'knowledge_ingestion_requests',
  'knowledge_ingestion_audit',
  'media_assets',
]);

let pool: Pool | null = null;

pgTypes.setTypeParser(20, (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
});

function writeResponse(request: WorkerRequest, payload: unknown, isError = false): void {
  const header = new Int32Array(request.header);
  const buffer = new Uint8Array(request.payload);
  let text = JSON.stringify(payload);
  let bytes = encoder.encode(text);

  if (bytes.length > buffer.byteLength) {
    text = JSON.stringify({
      message: `Worker result exceeded ${buffer.byteLength} bytes`,
      code: 'WORKER_RESULT_TOO_LARGE',
    });
    bytes = encoder.encode(text);
    isError = true;
  }

  buffer.fill(0);
  buffer.set(bytes.subarray(0, buffer.byteLength));
  Atomics.store(header, 1, Math.min(bytes.length, buffer.byteLength));
  Atomics.store(header, 0, isError ? 2 : 1);
  Atomics.notify(header, 0, 1);
}

function getPostgresPoolMax(): number {
  const parsed = Number(process.env.DB_POOL_MAX || 20);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 20;
}

function resolvePgSslMode(databaseUrl: string): string {
  const envMode = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  try {
    const parsed = new URL(databaseUrl);
    const urlMode = String(parsed.searchParams.get('sslmode') || '').trim().toLowerCase();
    return urlMode || envMode;
  } catch {
    return envMode;
  }
}

function normalizePostgresConnectionString(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

function resolvePgSslConfig(databaseUrl: string): false | { rejectUnauthorized: boolean } | undefined {
  const mode = resolvePgSslMode(databaseUrl);
  if (!mode) {
    return undefined;
  }

  if (mode === 'disable' || mode === 'allow' || mode === 'prefer') {
    return false;
  }

  if (mode === 'require' || mode === 'no-verify') {
    // RDS commonly terminates with a managed cert chain that isn't bundled in
    // minimal runtime images. "require" should still encrypt the connection.
    return { rejectUnauthorized: false };
  }

  if (mode === 'verify-ca' || mode === 'verify-full') {
    return { rejectUnauthorized: true };
  }

  return undefined;
}

function normalizeRowValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return value;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeRowValue(value)]),
  );
}

function convertQuestionPlaceholders(input: string): string {
  let result = '';
  let index = 1;
  let inString = false;

  for (let cursor = 0; cursor < input.length; cursor += 1) {
    const char = input[cursor];
    const next = input[cursor + 1];

    if (char === "'") {
      result += char;
      if (inString && next === "'") {
        result += next;
        cursor += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (!inString && char === '?') {
      result += `$${index++}`;
      continue;
    }

    result += char;
  }

  return result;
}

function splitSqlStatements(input: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    current += char;

    if (char === "'") {
      if (inSingleQuote && next === "'") {
        current += next;
        index += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && char === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed.slice(0, -1).trim());
      }
      current = '';
    }
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }

  return statements.filter(Boolean);
}

function summarizeSql(sql: string): string {
  const compact = sql.replace(/\s+/g, ' ').trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function rewriteSqlForPostgres(sql: string): string {
  let rewritten = String(sql || '').trim().replace(/;\s*$/, '');

  rewritten = rewritten.replace(
    /datetime\(\s*'now'\s*,\s*'-'\s*\|\|\s*\?\s*\|\|\s*' days'\s*\)/gi,
    "NOW() - (? || ' days')::interval",
  );
  rewritten = rewritten.replace(
    /datetime\(\s*'now'\s*,\s*'-1 hour'\s*\)/gi,
    "NOW() - INTERVAL '1 hour'",
  );
  rewritten = rewritten.replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()');
  rewritten = rewritten.replace(/datetime\(\s*([a-zA-Z0-9_.]+)\s*\)/g, '$1');

  if (/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+post_reactions\b/i.test(rewritten)) {
    rewritten = rewritten
      .replace(/^\s*INSERT\s+OR\s+REPLACE\s+INTO\b/i, 'INSERT INTO')
      .concat(' ON CONFLICT (post_id, user_id) DO UPDATE SET reaction_type = EXCLUDED.reaction_type');
  } else if (/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+health_data\b/i.test(rewritten)) {
    rewritten = rewritten
      .replace(/^\s*INSERT\s+OR\s+REPLACE\s+INTO\b/i, 'INSERT INTO')
      .concat(' ON CONFLICT (user_id, date) DO UPDATE SET steps = EXCLUDED.steps, calories_burned = EXCLUDED.calories_burned, active_minutes = EXCLUDED.active_minutes, synced_at = NOW()');
  } else if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(rewritten)) {
    rewritten = rewritten
      .replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO')
      .concat(' ON CONFLICT DO NOTHING');
  }

  return convertQuestionPlaceholders(rewritten);
}

function extractInsertTableName(sql: string): string | null {
  const match = sql.match(/^\s*INSERT\s+INTO\s+("?[\w.]+"?)/i);
  if (!match) return null;
  return match[1].replace(/"/g, '').split('.').pop() || null;
}

function withReturningIdIfNeeded(sql: string, mode: QueryMode): string {
  if (mode !== 'run' || /\bRETURNING\b/i.test(sql) || !/^\s*INSERT\s+INTO\b/i.test(sql)) {
    return sql;
  }
  const tableName = extractInsertTableName(sql);
  if (!tableName || !RETURNING_ID_TABLES.has(tableName)) {
    return sql;
  }
  return `${sql} RETURNING id`;
}

async function ensurePool(request: WorkerRequest): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const databaseUrl = String(request.databaseUrl || '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for postgres runtime');
  }

  const statementTimeoutMs = Number(request.statementTimeoutMs || 15_000);
  pool = new Pool({
    connectionString: normalizePostgresConnectionString(databaseUrl),
    max: getPostgresPoolMax(),
    statement_timeout: Number.isFinite(statementTimeoutMs) ? statementTimeoutMs : 15_000,
    ssl: resolvePgSslConfig(databaseUrl),
  });

  return pool;
}

async function initializeDatabase(request: WorkerRequest): Promise<void> {
  const clientPool = await ensurePool(request);
  const schemaSql = String(request.schemaSql || '').trim();
  if (!schemaSql) {
    return;
  }
  const statements = splitSqlStatements(schemaSql).filter(
    (statement) => !/^BEGIN$/i.test(statement) && !/^COMMIT$/i.test(statement),
  );

  const client = await clientPool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_INIT_LOCK_ID]);
    await client.query('BEGIN');
    try {
      for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `Schema init failed at statement ${index + 1}/${statements.length}: ${summarizeSql(statement)}`,
            { cause: error instanceof Error ? error : undefined },
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors so the original schema failure stays visible.
      }
      throw error;
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_INIT_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

async function runQuery(request: WorkerRequest) {
  const clientPool = await ensurePool(request);
  const mode = request.mode || 'all';
  const sql = withReturningIdIfNeeded(rewriteSqlForPostgres(String(request.sql || '')), mode);
  const params = Array.isArray(request.params) ? request.params : [];
  const result = await clientPool.query(sql, params);
  const rows = result.rows.map((row) => normalizeRow(row));

  if (mode === 'exec') {
    return { ok: true };
  }

  if (mode === 'get') {
    return rows[0] || null;
  }

  if (mode === 'run') {
    const firstRow = rows[0] as { id?: number | string | null } | undefined;
    const payload: RunResultPayload = {
      changes: Number(result.rowCount || 0),
      lastInsertRowid: firstRow?.id ?? null,
    };
    return payload;
  }

  return rows;
}

parentPort.on('message', async (request: WorkerRequest) => {
  try {
    if (request.type === 'close') {
      if (pool) {
        const closingPool = pool;
        pool = null;
        await closingPool.end();
      }
      writeResponse(request, { ok: true });
      return;
    }

    if (request.type === 'init') {
      await initializeDatabase(request);
      writeResponse(request, { ok: true });
      return;
    }

    const payload = await runQuery(request);
    writeResponse(request, payload);
  } catch (error) {
    writeResponse(request, {
      message: error instanceof Error ? error.message : String(error),
      code: 'POSTGRES_WORKER_ERROR',
    }, true);
  }
});

// Keep the process alive for worker requests.
setInterval(() => undefined, 60_000).unref();
