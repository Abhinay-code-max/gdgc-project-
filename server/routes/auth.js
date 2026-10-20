import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const publicUser = (user) => ({
  id: user._id ? user._id.toString() : user.id,
  email: user.email,
  role: user.role,
  displayName: user.displayName || null,
  avatarUrl: user.avatarUrl || null,
  createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
});

export const establishSession = (req, user) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.user = {
        id: user._id ? user._id.toString() : user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName || null,
        avatarUrl: user.avatarUrl || null,
      };
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });

export async function verifyGoogleProfile(accessToken, refreshToken, profile, done) {
  try {
    let verifiedEmail = null;

    // Rule 1: profile._json.email is accepted ONLY when profile._json.email_verified === true
    if (
      profile?._json &&
      profile._json.email_verified === true &&
      typeof profile._json.email === 'string'
    ) {
      const candidate = profile._json.email.trim().toLowerCase();
      if (emailPattern.test(candidate)) {
        verifiedEmail = candidate;
      }
    }

    // Rule 2: An emails[] entry is accepted ONLY when that same entry has verified === true
    if (!verifiedEmail && Array.isArray(profile?.emails)) {
      for (const entry of profile.emails) {
        if (
          (entry?.verified === true || entry?.verified === 'true') &&
          typeof entry?.value === 'string'
        ) {
          const candidate = entry.value.trim().toLowerCase();
          if (emailPattern.test(candidate)) {
            verifiedEmail = candidate;
            break;
          }
        }
      }
    }

    // If no verified email was extracted through paired authoritative claims:
    if (!verifiedEmail) {
      const rawCandidate = typeof profile?._json?.email === 'string'
        ? profile._json.email
        : (profile?.emails?.[0]?.value || null);

      if (rawCandidate && !emailPattern.test(rawCandidate.trim())) {
        return done(null, false, { message: 'invalid_email' });
      }
      if (!rawCandidate) {
        return done(null, false, { message: 'invalid_email' });
      }
      return done(null, false, { message: 'unverified_email' });
    }

    // Check if user already exists with this googleId
    let user = await User.findOne({ googleId: profile.id });
    if (user) {
      let updated = false;
      if (!user.displayName && profile.displayName) {
        user.displayName = profile.displayName.trim();
        updated = true;
      }
      if (!user.avatarUrl && profile.photos?.[0]?.value) {
        user.avatarUrl = profile.photos[0].value;
        updated = true;
      }
      if (updated) await user.save();
      return done(null, user);
    }

    // Safe account linking: if verified email matches existing account, link safely WITHOUT modifying role
    user = await User.findOne({ email: verifiedEmail });
    if (user) {
      user.googleId = profile.id;
      if (!user.displayName && profile.displayName) {
        user.displayName = profile.displayName.trim();
      }
      if (!user.avatarUrl && profile.photos?.[0]?.value) {
        user.avatarUrl = profile.photos[0].value;
      }
      // Never change existing role (preserves customer or studio)
      await user.save();
      return done(null, user);
    }

    // New user from Google: always customer role (no access/refresh tokens stored)
    user = await User.create({
      email: verifiedEmail,
      googleId: profile.id,
      displayName: profile.displayName ? profile.displayName.trim() : null,
      avatarUrl: profile.photos?.[0]?.value || null,
      role: 'customer',
      provider: 'google',
    });

    return done(null, user);
  } catch (error) {
    return done(error);
  }
}

export function createAuthRouter({ config, rateLimiters = {}, passportInstance = passport } = {}) {
  const router = Router();
  const { authLimiter = (req, res, next) => next(), oauthLimiter = (req, res, next) => next() } = rateLimiters;

  const hasGoogleConfig = Boolean(config?.googleClientId && config?.googleClientSecret);

  if (hasGoogleConfig) {
    // Only register strategy if not already registered on this passport instance
    const isAlreadyRegistered = passportInstance._strategy ? Boolean(passportInstance._strategy('google')) : false;
    if (!isAlreadyRegistered) {
      passportInstance.use(
        new GoogleStrategy(
          {
            clientID: config.googleClientId,
            clientSecret: config.googleClientSecret,
            callbackURL: config.googleCallbackUrl,
          },
          verifyGoogleProfile
        )
      );
    }
  }

  router.get('/config', (req, res) => {
    res.json({
      data: {
        googleAuthAvailable: hasGoogleConfig,
      },
    });
  });

  router.post('/register', authLimiter, async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const fields = {};

      if (!emailPattern.test(email)) fields.email = 'Enter a valid email address.';
      if (password.length < 12 || password.length > 128) {
        fields.password = 'Password must be 12 to 128 characters.';
      }

      if (Object.keys(fields).length) {
        return res.status(422).json({
          error: { code: 'VALIDATION_ERROR', message: 'Check the highlighted fields.', fields },
        });
      }

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({
          error: { code: 'EMAIL_TAKEN', message: 'An account already uses that email.' },
        });
      }

      const hash = await bcrypt.hash(password, 12);
      const user = await User.create({
        email,
        passwordHash: hash,
        role: 'customer', // Public registration ALWAYS customer
        provider: 'local',
      });

      const sessionUser = publicUser(user);
      await establishSession(req, sessionUser);
      return res.status(201).json({ data: { user: sessionUser } });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          error: { code: 'EMAIL_TAKEN', message: 'An account already uses that email.' },
        });
      }
      return next(error);
    }
  });

  router.post('/login', authLimiter, async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      const user = await User.findOne({ email });
      if (!user || !user.passwordHash) {
        return res.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
        });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
        });
      }

      const sessionUser = publicUser(user);
      await establishSession(req, sessionUser);
      return res.json({ data: { user: sessionUser } });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/logout', (req, res, next) => {
    if (!req.session?.user) {
      return res.json({ data: { loggedOut: true } });
    }
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('art-studio.sid');
      return res.json({ data: { loggedOut: true } });
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session?.user) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'You must sign in to continue.' },
      });
    }
    return res.json({ data: { user: req.session.user } });
  });

  // Google OAuth Routes with CSRF State Protection
  router.get('/google', oauthLimiter, (req, res, next) => {
    if (!hasGoogleConfig) {
      return res.redirect(`${config.appOrigin}/login?error=oauth_not_configured`);
    }

    // Generate cryptographically secure state nonce bound to session
    const state = crypto.randomBytes(32).toString('hex');
    req.session.oauthState = state;
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);

      passportInstance.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account',
        state,
        session: false,
      })(req, res, next);
    });
  });

  router.get('/google/callback', oauthLimiter, (req, res, next) => {
    if (!hasGoogleConfig) {
      return res.redirect(`${config.appOrigin}/login?error=oauth_not_configured`);
    }

    // Verify session-bound OAuth state against incoming state query parameter
    const sessionState = req.session?.oauthState;
    const queryState = typeof req.query?.state === 'string' ? req.query.state : null;

    if (!sessionState || !queryState || sessionState !== queryState) {
      if (req.session) delete req.session.oauthState;
      return res.redirect(`${config.appOrigin}/login?error=oauth_csrf_rejected`);
    }

    // Single-use state nonce consumption: immediately delete so consumed state cannot be reused
    delete req.session.oauthState;

    passportInstance.authenticate('google', { session: false }, async (err, user, info) => {
      if (err) {
        return res.redirect(`${config.appOrigin}/login?error=oauth_failed`);
      }
      if (!user) {
        const errorReason = info?.message === 'unverified_email'
          ? 'unverified_email'
          : (info?.message === 'invalid_email' ? 'invalid_email' : 'oauth_denied');
        return res.redirect(`${config.appOrigin}/login?error=${errorReason}`);
      }

      try {
        await establishSession(req, user);
        const redirectPath = user.role === 'studio' ? '/seller' : '/buyer';
        return res.redirect(`${config.appOrigin}${redirectPath}`);
      } catch (sessionErr) {
        return next(sessionErr);
      }
    })(req, res, next);
  });

  return router;
}
