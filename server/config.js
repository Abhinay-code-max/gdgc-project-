import 'dotenv/config';

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

  const mongodbUri = overrides.mongodbUri ?? process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
  const mongodbDbName = overrides.mongodbDbName ?? process.env.MONGODB_DB_NAME ?? 'art_studio';

  return {
    port: Number(overrides.port ?? process.env.PORT ?? 3000),
    mongodbUri,
    mongodbDbName,
    appOrigin: overrides.appOrigin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173',
    serverOrigin: overrides.serverOrigin ?? process.env.SERVER_ORIGIN ?? 'http://localhost:3000',
    googleClientId: overrides.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: overrides.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? '',
    googleCallbackUrl: overrides.googleCallbackUrl ?? process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/api/auth/google/callback',
    studioEmail: (overrides.studioEmail ?? process.env.STUDIO_EMAIL ?? 'studio@artstudio.com').trim().toLowerCase(),
    studioPassword: overrides.studioPassword ?? process.env.STUDIO_PASSWORD ?? 'StudioPass123!long',
    isProduction: prodFlag,
    ...overrides,
    sessionSecret,
  };
}
