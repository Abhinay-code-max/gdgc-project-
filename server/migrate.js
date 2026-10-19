import { getConfig } from './config.js';
import { createDatabase } from './db/index.js';

const config = getConfig();
const db = createDatabase(config.databasePath);
db.close();
console.log(`Applied database migrations to ${config.databasePath}`);
