import 'dotenv/config';
import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

export function getConfig(overrides = {}) {
  const prodFlag = overrides.isProduction ?? isProduction;
  let sessionSecret = overrides.sessionSecret;
  if (sessionSecret === undefined) {
    sessionSecret = prodFlag
      ? process.env.SESSION_SECRET
      : (process.env.SESSION_SECRET || 'development-only-secret-change-before-production');
  }

  if (prodFlag && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
  }

  return {
    port: Number(process.env.PORT || 3000),
    databasePath: path.resolve(process.env.DATABASE_PATH || './data/art-studio.sqlite'),
    appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
    ...overrides,
    sessionSecret,
    isProduction: prodFlag,
  };
}
