import path from 'node:path';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import mongoose from 'mongoose';
import passport from 'passport';
import { getConfig } from './config.js';
import { createAuthRouter } from './routes/auth.js';
import { createPaintingsRouter } from './routes/paintings.js';
import { createOrdersRouter } from './routes/orders.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { createRateLimiters } from './middleware/rateLimiter.js';

export function createApp(overrides = {}) {
  const config = getConfig(overrides);
  const app = express();

  // Configurable proxy trust (defaults to false for local/direct exposure)
  if (config.trustProxy !== false) {
    app.set('trust proxy', config.trustProxy);
  } else {
    app.set('trust proxy', false);
  }

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(express.json({ limit: '32kb' }));

  // Create rate limiters
  const rateLimiters = overrides.rateLimiters || createRateLimiters(overrides.rateLimitOptions);
  app.use('/api', rateLimiters.apiLimiter);

  // Setup session store
  let sessionStore = overrides.sessionStore;
  if (!sessionStore) {
    sessionStore = MongoStore.create({
      mongoUrl: config.mongodbUri,
      dbName: config.mongodbDbName,
      collectionName: 'sessions',
      ttl: 8 * 60 * 60, // 8 hours
      autoRemove: 'native',
    });
  }

  const sessionOptions = {
    name: 'art-studio.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // 'lax' permits top-level navigation from Google OAuth redirect
      secure: config.isProduction,
      maxAge: 28800000,
    },
    store: sessionStore,
  };
  app.use(session(sessionOptions));

  // Initialize passport middleware after session
  app.use(passport.initialize());

  // Mutation origin check
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('origin') !== config.appOrigin) {
      return res.status(403).json({
        error: { code: 'ORIGIN_FORBIDDEN', message: 'Request origin was not accepted.' },
      });
    }
    next();
  });

  // Health check
  app.get('/api/health', (req, res) => res.json({ data: { status: 'ok' } }));

  // API Routers
  app.use('/api/auth', createAuthRouter({ config, rateLimiters }));
  app.use('/api/paintings', createPaintingsRouter());
  app.use('/api/orders', createOrdersRouter());

  // Backend API 404 handler for any unhandled /api/* routes
  app.use('/api', notFound);

  // Serve static assets in production or if dist exists
  const distPath = path.resolve('dist');
  app.use(express.static(distPath));

  // SPA fallback for unknown non-API routes so React Router can display the frontend 404 page
  app.get('{*path}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexPath = path.join(distPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) next();
    });
  });

  // Final fallback
  app.use(notFound);
  app.use(errorHandler);

  app.locals.db = mongoose.connection;
  app.locals.sessionStore = sessionStore;
  app.locals.config = config;

  return app;
}
