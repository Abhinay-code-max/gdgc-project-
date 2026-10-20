import rateLimit from 'express-rate-limit';

export function createRateLimiters(options = {}) {
  const isTest = options.isTest ?? (process.env.NODE_ENV === 'test');

  const standardResponse = (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    });
  };

  // General API limiter: 300 requests per 15 minutes by default
  const apiLimiter = rateLimit({
    windowMs: options.apiWindowMs ?? 15 * 60 * 1000,
    max: options.apiMax ?? 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: standardResponse,
    skip: () => isTest && !options.enableApiLimiterInTest,
    validate: { xForwardedForHeader: false },
  });

  // Stricter auth limiter for registration and password login: 10 requests per 15 min
  const authLimiter = rateLimit({
    windowMs: options.authWindowMs ?? 15 * 60 * 1000,
    max: options.authMax ?? (isTest ? 5 : 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler: standardResponse,
    validate: { xForwardedForHeader: false },
  });

  // Limiter for OAuth initiation and callback: 25 requests per 15 min
  const oauthLimiter = rateLimit({
    windowMs: options.oauthWindowMs ?? 15 * 60 * 1000,
    max: options.oauthMax ?? (isTest ? 5 : 25),
    standardHeaders: true,
    legacyHeaders: false,
    handler: standardResponse,
    validate: { xForwardedForHeader: false },
  });

  return { apiLimiter, authLimiter, oauthLimiter };
}
