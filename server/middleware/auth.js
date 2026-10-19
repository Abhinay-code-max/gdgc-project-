/**
 * Authentication and Role Authorization Middleware (ESM)
 * Owned by Agent 1 (Foundation & Auth)
 */

export function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'You must sign in to continue.' }
    });
  }
  return next();
}

export function requireRole(...allowedRoles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!allowedRoles.includes(req.session.user.role)) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You do not have permission for that action.' }
        });
      }
      return next();
    }
  ];
}
