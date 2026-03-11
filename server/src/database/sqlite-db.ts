import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database;

export function initDB() {
  db = new Database(path.join(process.cwd(), 'data', 'zym.db'));

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      selected_coach TEXT DEFAULT 'zj',
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
  `);

  const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const sessionColumns = db.prepare('PRAGMA table_info(user_sessions)').all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === 'connect_code')) {
    db.exec('ALTER TABLE users ADD COLUMN connect_code TEXT');
  }
  if (!userColumns.some((column) => column.name === 'timezone')) {
    db.exec('ALTER TABLE users ADD COLUMN timezone TEXT');
  }
  if (!sessionColumns.some((column) => column.name === 'ip_address')) {
    db.exec('ALTER TABLE user_sessions ADD COLUMN ip_address TEXT');
  }
  if (!sessionColumns.some((column) => column.name === 'refresh_token_hash')) {
    db.exec('ALTER TABLE user_sessions ADD COLUMN refresh_token_hash TEXT');
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_connect_code ON users(connect_code)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_hash ON user_sessions(refresh_token_hash)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_topic_id ON messages(topic, id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_mentions_user_read ON mention_notifications(user_id, is_read, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_abuse_reports_reporter ON abuse_reports(reporter_user_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_abuse_reports_status ON abuse_reports(status, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_ingestion_status ON knowledge_ingestion_requests(status, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_ingestion_requester ON knowledge_ingestion_requests(requester_user_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_ingestion_audit_request ON knowledge_ingestion_audit(request_id, created_at DESC)');

  const missingCodes = db.prepare("SELECT id FROM users WHERE connect_code IS NULL OR connect_code = ''").all() as Array<{ id: number }>;
  const findByCode = db.prepare('SELECT id FROM users WHERE connect_code = ?');
  const updateCode = db.prepare('UPDATE users SET connect_code = ? WHERE id = ?');

  for (const row of missingCodes) {
    for (let attempts = 0; attempts < 40; attempts += 1) {
      const candidate = String(Math.floor(100000 + Math.random() * 900000));
      const exists = findByCode.get(candidate) as { id: number } | undefined;
      if (!exists) {
        updateCode.run(candidate, row.id);
        break;
      }
    }
  }
}

export function getDB() {
  return db;
}
