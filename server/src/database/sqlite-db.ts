import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';
import { resolveAppDataRoot } from '../config/app-paths.js';

type RunResult = {
  changes: number;
  lastInsertRowid: number | string | null;
};

interface DatabaseStatement {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
  run(...params: unknown[]): RunResult;
}

interface RuntimeDatabase {
  prepare(sql: string): DatabaseStatement;
  exec(sql: string): void;
}

type RuntimeProvider = 'sqlite' | 'postgres';

const POSTGRES_RESULT_BUFFER_BYTES = 16 * 1024 * 1024;

let db: RuntimeDatabase | null = null;
let postgresBridge: PostgresBridge | null = null;

function resolveRuntimeProvider(): RuntimeProvider {
  const configured = String(process.env.DATABASE_PROVIDER || '').trim().toLowerCase();
  if (configured === 'postgres') {
    return 'postgres';
  }
  return 'sqlite';
}

function getSqliteDatabasePath(): string {
  const configured = String(process.env.SQLITE_DATABASE_PATH || '').trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(resolveAppDataRoot(), 'zym.db');
}

function getPostgresDatabaseUrl(): string {
  return String(process.env.DATABASE_URL || '').trim();
}

function getPostgresStatementTimeoutMs(): number {
  const parsed = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

function runtimeWorkerUrl(): URL {
  const isTsRuntime = import.meta.url.endsWith('.ts');
  return new URL(`./postgres-sync-worker.${isTsRuntime ? 'ts' : 'js'}`, import.meta.url);
}

function runtimeWorkerExecArgv(): string[] {
  return import.meta.url.endsWith('.ts') ? ['--import', 'tsx'] : [];
}

class SqliteStatementAdapter implements DatabaseStatement {
  constructor(private readonly statement: Database.Statement) {}

  get(...params: unknown[]): Record<string, unknown> | undefined {
    return this.statement.get(...params) as Record<string, unknown> | undefined;
  }

  all(...params: unknown[]): Array<Record<string, unknown>> {
    return this.statement.all(...params) as Array<Record<string, unknown>>;
  }

  run(...params: unknown[]): RunResult {
    const result = this.statement.run(...params);
    return {
      changes: Number(result.changes || 0),
      lastInsertRowid: result.lastInsertRowid === undefined || result.lastInsertRowid === null
        ? null
        : typeof result.lastInsertRowid === 'bigint'
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid,
    };
  }
}

class SqliteDatabaseAdapter implements RuntimeDatabase {
  constructor(private readonly sqlite: Database.Database) {}

  prepare(sql: string): DatabaseStatement {
    return new SqliteStatementAdapter(this.sqlite.prepare(sql));
  }

  exec(sql: string): void {
    this.sqlite.exec(sql);
  }
}

interface PostgresBridgeRequest {
  type: 'init' | 'query' | 'close';
  header: SharedArrayBuffer;
  payload: SharedArrayBuffer;
  sql?: string;
  params?: unknown[];
  mode?: 'get' | 'all' | 'run' | 'exec';
  databaseUrl?: string;
  schemaSql?: string;
  statementTimeoutMs?: number;
}

class PostgresBridge {
  private readonly worker: Worker;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private readonly header = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  private readonly payload = new SharedArrayBuffer(POSTGRES_RESULT_BUFFER_BYTES);
  private readonly headerView = new Int32Array(this.header);
  private readonly payloadView = new Uint8Array(this.payload);

  constructor() {
    this.worker = new Worker(runtimeWorkerUrl(), {
      execArgv: runtimeWorkerExecArgv(),
    });
  }

  initialize(schemaSql: string): void {
    this.call({
      type: 'init',
      databaseUrl: getPostgresDatabaseUrl(),
      schemaSql,
      statementTimeoutMs: getPostgresStatementTimeoutMs(),
    });
  }

  query(
    sql: string,
    params: unknown[],
    mode: 'get' | 'all' | 'run',
  ): Record<string, unknown> | Array<Record<string, unknown>> | RunResult | undefined {
    return this.call({
      type: 'query',
      sql,
      params,
      mode,
      databaseUrl: getPostgresDatabaseUrl(),
      statementTimeoutMs: getPostgresStatementTimeoutMs(),
    });
  }

  close(): void {
    try {
      this.call({
        type: 'close',
        databaseUrl: getPostgresDatabaseUrl(),
        statementTimeoutMs: getPostgresStatementTimeoutMs(),
      });
    } finally {
      void this.worker.terminate();
    }
  }

  private call(request: Omit<PostgresBridgeRequest, 'header' | 'payload'>): any {
    Atomics.store(this.headerView, 0, 0);
    Atomics.store(this.headerView, 1, 0);
    this.payloadView.fill(0);

    this.worker.postMessage({
      ...request,
      header: this.header,
      payload: this.payload,
    } satisfies PostgresBridgeRequest);

    Atomics.wait(this.headerView, 0, 0);
    const status = Atomics.load(this.headerView, 0);
    const bytesLength = Atomics.load(this.headerView, 1);
    const text = this.decoder.decode(this.payloadView.subarray(0, bytesLength));
    const data = text ? JSON.parse(text) : null;

    if (status === 2) {
      throw new Error(String(data?.message || 'Unknown Postgres worker error'));
    }

    return data ?? undefined;
  }
}

class PostgresStatementAdapter implements DatabaseStatement {
  constructor(
    private readonly bridge: PostgresBridge,
    private readonly sql: string,
  ) {}

  get(...params: unknown[]): Record<string, unknown> | undefined {
    const row = this.bridge.query(this.sql, params, 'get');
    return row ? row as Record<string, unknown> : undefined;
  }

  all(...params: unknown[]): Array<Record<string, unknown>> {
    const rows = this.bridge.query(this.sql, params, 'all');
    return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : [];
  }

  run(...params: unknown[]): RunResult {
    const result = this.bridge.query(this.sql, params, 'run');
    if (!result || Array.isArray(result)) {
      return { changes: 0, lastInsertRowid: null };
    }
    return result as RunResult;
  }
}

class PostgresDatabaseAdapter implements RuntimeDatabase {
  constructor(private readonly bridge: PostgresBridge) {}

  prepare(sql: string): DatabaseStatement {
    return new PostgresStatementAdapter(this.bridge, sql);
  }

  exec(sql: string): void {
    this.bridge.query(sql, [], 'run');
  }
}

function initializeSqliteSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      email_verified_at DATETIME,
      selected_coach TEXT,
      avatar_url TEXT,
      background_url TEXT,
      bio TEXT,
      fitness_goal TEXT,
      hobbies TEXT,
      timezone TEXT,
      apple_health_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      friend_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      coach_enabled TEXT DEFAULT 'none',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      from_user_id INTEGER NOT NULL,
      content TEXT,
      media_urls TEXT,
      mentions TEXT,
      reply_to INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'friends',
      content TEXT,
      media_urls TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS post_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reaction_type TEXT DEFAULT 'like',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS health_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      steps INTEGER,
      calories_burned INTEGER,
      active_minutes INTEGER,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id TEXT UNIQUE NOT NULL,
      device_name TEXT,
      ip_address TEXT,
      refresh_token_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_email_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_type TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      consent_type TEXT NOT NULL,
      version TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, consent_type, version)
    );

    CREATE TABLE IF NOT EXISTS friend_connect_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      connect_code TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      user_id INTEGER NOT NULL,
      topic TEXT NOT NULL,
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, topic)
    );

    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mention_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      topic TEXT,
      message_id INTEGER,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      snippet TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coach_outreach_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      trigger_type TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      coach_id TEXT NOT NULL DEFAULT 'zj',
      local_day TEXT,
      payload TEXT,
      message_id INTEGER,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS abuse_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_user_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      ip_address TEXT,
      user_agent TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_ingestion_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_user_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      domain TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      risk_level TEXT DEFAULT 'low',
      risk_flags TEXT,
      reviewed_by_user_id INTEGER,
      review_notes TEXT,
      reviewed_at DATETIME,
      applied_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_ingestion_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_bucket TEXT,
      object_key TEXT NOT NULL,
      file_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'file',
      visibility TEXT NOT NULL DEFAULT 'private',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT,
      source TEXT NOT NULL DEFAULT 'upload',
      metadata TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS media_asset_attachments (
      media_asset_id TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      entity_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (media_asset_id, entity_type, entity_id, entity_key)
    );
  `);

  const userColumns = sqlite.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const sessionColumns = sqlite.prepare('PRAGMA table_info(user_sessions)').all() as Array<{ name: string }>;
  const postColumns = sqlite.prepare('PRAGMA table_info(posts)').all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === 'connect_code')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN connect_code TEXT');
  }
  if (!userColumns.some((column) => column.name === 'timezone')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN timezone TEXT');
  }
  if (!userColumns.some((column) => column.name === 'email_verified_at')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN email_verified_at DATETIME');
  }
  if (!userColumns.some((column) => column.name === 'google_sub')) {
    sqlite.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
  }
  if (!sessionColumns.some((column) => column.name === 'ip_address')) {
    sqlite.exec('ALTER TABLE user_sessions ADD COLUMN ip_address TEXT');
  }
  if (!sessionColumns.some((column) => column.name === 'refresh_token_hash')) {
    sqlite.exec('ALTER TABLE user_sessions ADD COLUMN refresh_token_hash TEXT');
  }
  if (!postColumns.some((column) => column.name === 'visibility')) {
    sqlite.exec("ALTER TABLE posts ADD COLUMN visibility TEXT DEFAULT 'friends'");
  }

  sqlite.exec(`
    UPDATE users
    SET email_verified_at = COALESCE(email_verified_at, created_at)
    WHERE email IS NOT NULL
      AND TRIM(COALESCE(email, '')) != ''
      AND email_verified_at IS NULL
  `);

  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_connect_code ON users(connect_code)');
  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_hash ON user_sessions(refresh_token_hash)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_auth_email_tokens_user_type ON auth_email_tokens(user_id, token_type, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_auth_email_tokens_email_type ON auth_email_tokens(email, token_type, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_auth_email_tokens_expires_at ON auth_email_tokens(expires_at)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_user_consents_user_type ON user_consents(user_id, consent_type, accepted_at DESC)');
  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_connect_codes_connect_code ON friend_connect_codes(connect_code)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_friend_connect_codes_user_expires ON friend_connect_codes(user_id, expires_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_friend_connect_codes_expires_at ON friend_connect_codes(expires_at)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_messages_topic_id ON messages(topic, id)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_posts_visibility_created ON posts(visibility, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_mentions_user_read ON mention_notifications(user_id, is_read, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_coach_outreach_events_user_sent ON coach_outreach_events(user_id, sent_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_coach_outreach_events_trigger_day ON coach_outreach_events(trigger_type, local_day, sent_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_abuse_reports_reporter ON abuse_reports(reporter_user_id, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_abuse_reports_status ON abuse_reports(status, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_ingestion_status ON knowledge_ingestion_requests(status, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_ingestion_requester ON knowledge_ingestion_requests(requester_user_id, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_ingestion_audit_request ON knowledge_ingestion_audit(request_id, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_assets_owner_created ON media_assets(owner_user_id, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_assets_status_created ON media_assets(status, created_at DESC)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_assets_object_key ON media_assets(object_key)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_asset_attachments_entity ON media_asset_attachments(entity_type, entity_id, entity_key)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_media_asset_attachments_owner ON media_asset_attachments(owner_user_id, created_at DESC)');
}

function ensureConnectCodes(runtimeDb: RuntimeDatabase): void {
  const missingCodes = runtimeDb
    .prepare("SELECT id FROM users WHERE connect_code IS NULL OR connect_code = ''")
    .all() as Array<{ id: number }>;
  const findByCode = runtimeDb.prepare('SELECT id FROM users WHERE connect_code = ?');
  const updateCode = runtimeDb.prepare('UPDATE users SET connect_code = ? WHERE id = ?');

  for (const row of missingCodes) {
    for (let attempts = 0; attempts < 40; attempts += 1) {
      const candidate = String(Math.floor(100000 + Math.random() * 900000));
      const exists = findByCode.get(candidate) as { id?: number } | undefined;
      if (!exists?.id) {
        updateCode.run(candidate, row.id);
        break;
      }
    }
  }
}

export async function initDB(): Promise<void> {
  if (db) {
    return;
  }

  const provider = resolveRuntimeProvider();
  if (provider === 'postgres') {
    const databaseUrl = getPostgresDatabaseUrl();
    if (!databaseUrl) {
      throw new Error('DATABASE_PROVIDER=postgres requires DATABASE_URL');
    }

    const schemaPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    postgresBridge = new PostgresBridge();
    postgresBridge.initialize(schemaSql);
    db = new PostgresDatabaseAdapter(postgresBridge);
    ensureConnectCodes(db);
    return;
  }

  const sqlite = new Database(getSqliteDatabasePath());
  initializeSqliteSchema(sqlite);
  db = new SqliteDatabaseAdapter(sqlite);
  ensureConnectCodes(db);
}

export function getDB(): RuntimeDatabase {
  if (!db) {
    throw new Error('Database has not been initialized. Call initDB() first.');
  }
  return db;
}

export function getDatabaseProvider(): RuntimeProvider {
  return resolveRuntimeProvider();
}

export function closeDB(): void {
  if (postgresBridge) {
    postgresBridge.close();
    postgresBridge = null;
  }
  db = null;
}
