import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { provisionDemoStudents } from '../server/demoStudentProvisioning.js';

const rosterPath = process.argv[2];
if (!rosterPath || !process.env.DATABASE_PATH) throw new Error('用法：DATABASE_PATH=<服务器数据库> node scripts/add-demo-students.mjs <私有名单.json>');
const databasePath = path.resolve(process.env.DATABASE_PATH);
if (!fs.existsSync(databasePath)) throw new Error('数据库不存在，拒绝创建空数据库');
const students = JSON.parse(fs.readFileSync(rosterPath,'utf8'));
const db = openDatabase(databasePath);
try {
  const backupPath = databasePath + '.before-demo-students-' + new Date().toISOString().replaceAll(':','-') + '.sqlite';
  await db.backup(backupPath);
  const result = await provisionDemoStudents(db,students);
  console.log(JSON.stringify({...result,backupPath}));
} finally { db.close(); }
