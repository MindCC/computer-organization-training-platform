// Administrative import: initial username/password = student number.
// Only accounts already in the target class can be reused; their edits are retained.
// Usage: node scripts/import-roster-classes.mjs <roster.json> [databasePath]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { importRosterClasses } from '../server/rosterImport.js';

const rosterPath = process.argv[2];
assert(rosterPath, 'usage: node scripts/import-roster-classes.mjs <roster.json> [databasePath]');
const databasePath = path.resolve(process.argv[3] ?? process.env.DATABASE_PATH ?? 'data/classroom.sqlite');
assert(fs.existsSync(databasePath), '数据库不存在，请先初始化正确的数据库');
const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
const db = openDatabase(databasePath);
try {
  const backupDirectory = path.resolve(path.dirname(databasePath), 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, `before-roster-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
  await db.backup(backupPath);
  const report = await importRosterClasses(db, roster);
  console.log(JSON.stringify({ databasePath, backupPath, ...report }, null, 2));
} finally { db.close(); }
