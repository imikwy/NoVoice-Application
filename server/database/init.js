const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Allow the DB path to be overridden via env (useful for Docker volumes)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'novoice.db');

let db = null;

class DatabaseWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
    this._inTransaction = false;
  }

  _save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
  }

  prepare(sql) {
    const wrapper = this;
    const sqlDb = this._db;

    return {
      run(...params) {
        sqlDb.run(sql, params);
        if (!wrapper._inTransaction) {
          wrapper._save();
        }
        return { changes: sqlDb.getRowsModified() };
      },
      get(...params) {
        const stmt = sqlDb.prepare(sql);
        if (params.length) stmt.bind(params);
        let row;
        if (stmt.step()) {
          row = stmt.getAsObject();
        }
        stmt.free();
        return row || undefined;
      },
      all(...params) {
        const results = [];
        const stmt = sqlDb.prepare(sql);
        if (params.length) stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
    };
  }

  transaction(fn) {
    const wrapper = this;
    return (...args) => {
      wrapper._inTransaction = true;
      wrapper._db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        wrapper._db.run('COMMIT');
        wrapper._inTransaction = false;
        wrapper._save();
        return result;
      } catch (err) {
        wrapper._inTransaction = false;
        try {
          wrapper._db.run('ROLLBACK');
        } catch (_) {}
        throw err;
      }
    };
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = new DatabaseWrapper(sqlDb);

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#34C759',
      status TEXT DEFAULT 'offline',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (friend_id) REFERENCES users(id),
      UNIQUE(user_id, friend_id)
    )`,
    // direct_messages table kept for schema compatibility but never written to (relay-only)
    `CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )`,
    // Pending DMs for offline delivery — auto-expire after 7 days
    `CREATE TABLE IF NOT EXISTS pending_dms (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      icon_color TEXT DEFAULT '#007AFF',
      server_type TEXT DEFAULT 'novoice',
      server_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS server_members (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(server_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      position INTEGER DEFAULT 0,
      category_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    )`,
    // ── Special channel type content ─────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS rules_content (
      channel_id TEXT PRIMARY KEY,
      content TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    )`,
    `CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT,
      color TEXT DEFAULT '#007AFF',
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      completed INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'normal',
      due_date TEXT,
      position INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    )`,
    `CREATE TABLE IF NOT EXISTS task_categories (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS task_items (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      completed INTEGER DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      updated_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (category_id) REFERENCES task_categories(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS task_channel_editors (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (granted_by) REFERENCES users(id),
      UNIQUE(channel_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS forum_posts (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    )`,
    `CREATE TABLE IF NOT EXISTS forum_replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES forum_posts(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_dm_users ON direct_messages(sender_id, receiver_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pending_dms ON pending_dms(receiver_id, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_server_members ON server_members(server_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_friendships ON friendships(user_id, friend_id)`,
    // ── Rule blocks (categories in grid rows, text/sep standalone or as children) ─
    `CREATE TABLE IF NOT EXISTS rule_blocks (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL DEFAULT '{}',
      parent_id TEXT DEFAULT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      row_id TEXT DEFAULT NULL,
      col_idx INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rule_blocks ON rule_blocks(channel_id, parent_id, sort_order)`,
    `CREATE INDEX IF NOT EXISTS idx_calendar_events ON calendar_events(channel_id, start_date)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks ON tasks(channel_id, position)`,
    `CREATE INDEX IF NOT EXISTS idx_task_categories ON task_categories(channel_id, position)`,
    `CREATE INDEX IF NOT EXISTS idx_task_items ON task_items(channel_id, category_id, position)`,
    `CREATE INDEX IF NOT EXISTS idx_task_editors ON task_channel_editors(channel_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_forum_posts ON forum_posts(channel_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_forum_replies ON forum_replies(post_id, created_at)`,
  ];

  for (const sql of tables) {
    try {
      db._db.run(sql);
    } catch (e) {
      // Table/index may already exist
    }
  }

  // Migrations for existing databases — add new columns if they don't exist
  const migrations = [
    `ALTER TABLE servers ADD COLUMN server_type TEXT DEFAULT 'novoice'`,
    `ALTER TABLE servers ADD COLUMN server_url TEXT`,
    `ALTER TABLE channels ADD COLUMN category_id TEXT`,
    // rule_blocks v2: hierarchical model (parent_id + sort_order)
    `ALTER TABLE rule_blocks ADD COLUMN parent_id TEXT DEFAULT NULL`,
    `ALTER TABLE rule_blocks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
    // rule_blocks v3: grid row support (row_id + col_idx)
    `ALTER TABLE rule_blocks ADD COLUMN row_id TEXT DEFAULT NULL`,
    `ALTER TABLE rule_blocks ADD COLUMN col_idx INTEGER NOT NULL DEFAULT 0`,
  ];

  for (const sql of migrations) {
    try {
      db._db.run(sql);
    } catch (_) {
      // Column already exists — that's fine
    }
  }

  db._save();
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

module.exports = { initDatabase, getDb };
