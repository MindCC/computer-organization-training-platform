import { migrate, openDatabase, resolveDatabasePath } from './db.js';
import { removeLegacyDemoSeed } from './removeLegacyDemoSeed.js';

const db = openDatabase(process.env.DATABASE_PATH);
try {
  migrate(db);
  const result = await removeLegacyDemoSeed(db);
  console.log(`Demo pair ready: ${JSON.stringify(result)}`);
  console.log(`Database: ${resolveDatabasePath(process.env.DATABASE_PATH)}`);
} finally {
  db.close();
}
