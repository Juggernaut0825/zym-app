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
  `);

  const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === 'connect_code')) {
    db.exec('ALTER TABLE users ADD COLUMN connect_code TEXT');
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_connect_code ON users(connect_code)');

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
