import { createApp } from './app.js';
import { getConfig } from './config.js';
import { connectDatabase, closeDatabase } from './db/connection.js';

const config = getConfig();

async function start() {
  try {
    await connectDatabase(config.mongodbUri, config.mongodbDbName);
    console.log(`Connected to MongoDB at ${config.mongodbUri} (${config.mongodbDbName})`);
  } catch (error) {
    console.error(`MongoDB startup connection failure:`, error.message);
    process.exit(1);
  }

  const app = createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`Art Studio API listening on http://localhost:${config.port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}. Shutting down gracefully...`);

    server.close(async () => {
      try {
        if (app.locals.sessionStore?.close) {
          await app.locals.sessionStore.close();
        }
        await closeDatabase();
        console.log('MongoDB connection and HTTP server closed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });

    // Force close after 10 seconds if graceful shutdown takes too long
    setTimeout(() => {
      console.error('Forced shutdown due to timeout.');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
