import { getConfig } from './config.js';
import { connectDatabase, closeDatabase } from './db/connection.js';
import { User } from './models/User.js';
import { Painting } from './models/Painting.js';
import { Order } from './models/Order.js';

export async function initDatabase(customConfig = {}) {
  const config = getConfig(customConfig);
  const conn = await connectDatabase(config.mongodbUri, config.mongodbDbName);
  console.log(`Ensuring indexes on MongoDB database '${config.mongodbDbName}'...`);

  await Promise.all([
    User.init(),
    Painting.init(),
    Order.init(),
  ]);

  console.log('All MongoDB models and indexes successfully initialized.');
  return conn;
}

// CLI execution check
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server/init-db.js')) {
  initDatabase()
    .then(async () => {
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Database initialization failed:', error);
      await closeDatabase().catch(() => {});
      process.exit(1);
    });
}
