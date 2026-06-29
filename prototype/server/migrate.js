import { migrate, openDatabase, resolveDatabasePath } from "./db.js";

const db = openDatabase(process.env.DATABASE_PATH);
migrate(db);
console.log(`Database migrated: ${resolveDatabasePath(process.env.DATABASE_PATH)}`);
