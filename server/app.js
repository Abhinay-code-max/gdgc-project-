import path from 'node:path';
import express from 'express';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import helmet from 'helmet';
import { createDatabase } from './db/index.js';
import { getConfig } from './config.js';
import { createAuthRouter } from './routes/auth.js';
import { createPaintingsRouter } from './routes/paintings.js';
import { createOrdersRouter } from './routes/orders.js';
import { errorHandler, notFound } from './middleware/errors.js';

const SQLiteStore = connectSqlite3(session);
export function createApp(overrides = {}) {
  const config = getConfig(overrides);
  const db = overrides.db || createDatabase(config.databasePath);
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(express.json({ limit: '32kb' }));
  const sessionOptions = {
    name: 'art-studio.sid', secret: config.sessionSecret, resave: false,
    saveUninitialized: false, rolling: true,
    cookie: { httpOnly: true, sameSite: 'strict', secure: config.isProduction, maxAge: 28800000 },
  };
  if (overrides.sessionStore) sessionOptions.store = overrides.sessionStore;
  else if (config.databasePath !== ':memory:') sessionOptions.store = new SQLiteStore({ db: path.basename(config.databasePath), dir: path.dirname(config.databasePath), concurrentDB: true });
  app.use(session(sessionOptions));
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('origin') !== config.appOrigin) return res.status(403).json({ error: { code: 'ORIGIN_FORBIDDEN', message: 'Request origin was not accepted.' } });
    next();
  });
  app.get('/api/health', (req, res) => res.json({ data: { status: 'ok' } }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/paintings', createPaintingsRouter(db));
  app.use('/api/orders', createOrdersRouter(db));

  // Serve static assets from dist if built
  const distPath = path.resolve('dist');
  if (path && distPath) {
    app.use(express.static(distPath));
    app.get('{*path}', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const indexPath = path.join(distPath, 'index.html');
      return res.sendFile(indexPath, (err) => {
        if (err) next();
      });
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  app.locals.db = db;
  return app;
}
