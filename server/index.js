import { createApp } from './app.js';
import { getConfig } from './config.js';

const config = getConfig();
if (config.isProduction && process.env.SESSION_SECRET?.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
}
const app = createApp(config);
const server = app.listen(config.port, () => console.log(`Art Studio API listening on http://localhost:${config.port}`));
function shutdown() {
  server.close(() => {
    app.locals.db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
