import { Router } from 'express';
import bcrypt from 'bcryptjs';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
});

const establishSession = (req, user) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.user = { id: user.id, email: user.email, role: user.role };
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });

export function createAuthRouter(db) {
  const router = Router();

  router.post('/register', async (req, res, next) => {
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

      const hash = await bcrypt.hash(password, 12);
      let result;
      try {
        result = db
          .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'customer')")
          .run(email, hash);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || (error.message && error.message.includes('UNIQUE'))) {
          return res.status(409).json({
            error: { code: 'EMAIL_TAKEN', message: 'An account already uses that email.' },
          });
        }
        throw error;
      }

      const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid));
      await establishSession(req, user);
      return res.status(201).json({ data: { user } });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        return res.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
        });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
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

  return router;
}
