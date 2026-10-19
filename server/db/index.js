import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(here, '../migrations');

export function openDatabase(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (filename !== ':memory:') db.pragma('journal_mode = WAL');
  return db;
}

export function migrateDatabase(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const record = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');
  const runMigration = db.transaction((name, sql) => {
    db.exec(sql);
    record.run(name);
  });

  for (const name of fs.readdirSync(migrationsDirectory).filter((file) => file.endsWith('.sql')).sort()) {
    if (!applied.get(name)) {
      runMigration(name, fs.readFileSync(path.join(migrationsDirectory, name), 'utf8'));
    }
  }
  return db;
}

export function createDatabase(filename) {
  return migrateDatabase(openDatabase(filename));
}
