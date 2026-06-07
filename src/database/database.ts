import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('ghostkey.db');
  await initTables();
  return db;
}

async function initTables() {
  const d = await getDb();
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL,
      size INTEGER DEFAULT 0, mime_type TEXT DEFAULT '',
      modified_at TEXT, is_directory INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY, file_id TEXT, type TEXT NOT NULL,
      value TEXT NOT NULL, context TEXT DEFAULT '',
      confidence REAL DEFAULT 0.0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (file_id) REFERENCES files(id)
    );
    CREATE TABLE IF NOT EXISTS vault_items (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, label TEXT NOT NULL,
      encrypted_data TEXT NOT NULL, tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS timeline (
      id TEXT PRIMARY KEY, file_id TEXT, file_name TEXT,
      action TEXT NOT NULL, detail TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#888888', count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS analysis_cache (
      id TEXT PRIMARY KEY, file_id TEXT UNIQUE, file_name TEXT,
      summary TEXT, entities_json TEXT DEFAULT '[]',
      tags_json TEXT DEFAULT '[]', sentiment TEXT,
      categories_json TEXT DEFAULT '[]',
      analyzed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL,
      content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_entities_file ON entities(file_id);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_timeline_ts ON timeline(timestamp);
  `);
}

export async function addFile(file: { id: string; name: string; path: string; size: number; mimeType: string; modifiedAt: string; isDirectory: boolean }) {
  const d = await getDb();
  await d.runAsync(
    'INSERT OR REPLACE INTO files (id, name, path, size, mime_type, modified_at, is_directory) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [file.id, file.name, file.path, file.size, file.mimeType, file.modifiedAt, file.isDirectory ? 1 : 0]
  );
}

export async function getRecentFiles(limit = 50): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM files ORDER BY updated_at DESC LIMIT ?', [limit]);
}

export async function addEntity(entity: { id: string; fileId: string; type: string; value: string; context: string; confidence: number }) {
  const d = await getDb();
  await d.runAsync(
    'INSERT OR REPLACE INTO entities (id, file_id, type, value, context, confidence) VALUES (?, ?, ?, ?, ?, ?)',
    [entity.id, entity.fileId, entity.type, entity.value, entity.context, entity.confidence]
  );
}

export async function getAllEntities(): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM entities ORDER BY created_at DESC');
}

export async function getEntitiesByFile(fileId: string): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM entities WHERE file_id = ? ORDER BY confidence DESC', [fileId]);
}

export async function addVaultItem(item: { id: string; type: string; label: string; encryptedData: string; tags: string[] }) {
  const d = await getDb();
  await d.runAsync(
    'INSERT OR REPLACE INTO vault_items (id, type, label, encrypted_data, tags) VALUES (?, ?, ?, ?, ?)',
    [item.id, item.type, item.label, item.encryptedData, JSON.stringify(item.tags)]
  );
}

export async function getVaultItems(): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM vault_items ORDER BY updated_at DESC');
}

export async function addTimelineEntry(entry: { id: string; fileId: string; fileName: string; action: string; detail: string }) {
  const d = await getDb();
  await d.runAsync(
    'INSERT INTO timeline (id, file_id, file_name, action, detail) VALUES (?, ?, ?, ?, ?)',
    [entry.id, entry.fileId, entry.fileName, entry.action, entry.detail]
  );
}

export async function getTimeline(limit = 100): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM timeline ORDER BY timestamp DESC LIMIT ?', [limit]);
}

export async function addTag(tag: { id: string; name: string; color: string }) {
  const d = await getDb();
  await d.runAsync('INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)', [tag.id, tag.name, tag.color]);
}

export async function getTags(): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM tags ORDER BY count DESC');
}

export async function saveChatMessage(role: string, content: string) {
  const d = await getDb();
  await d.runAsync('INSERT INTO chat_history (role, content) VALUES (?, ?)', [role, content]);
}

export async function getChatHistory(limit = 50): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync('SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?', [limit]);
}

export async function searchFiles(query: string): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync(
    'SELECT * FROM files WHERE name LIKE ? OR path LIKE ? ORDER BY updated_at DESC LIMIT 50',
    ['%' + query + '%', '%' + query + '%']
  );
}

export async function searchEntities(query: string): Promise<any[]> {
  const d = await getDb();
  return await d.getAllAsync(
    'SELECT * FROM entities WHERE value LIKE ? OR context LIKE ? ORDER BY confidence DESC LIMIT 50',
    ['%' + query + '%', '%' + query + '%']
  );
}
