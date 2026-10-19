import 'dotenv/config';
import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

export function getConfig(overrides = {}) {
  return {
    port: Number(process.env.PORT || 3000),
    databasePath: path.resolve(process.env.DATABASE_PATH || './data/art-studio.sqlite'),
    sessionSecret: process.env.SESSION_SECRET || 'development-only-secret-change-before-production',
    appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
    isProduction,
    ...overrides,
  };
}
