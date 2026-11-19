/**
 * Express middleware for JWT authentication.
 *
 * The token travels in an HttpOnly cookie named {@link TOKEN_COOKIE}. It is
 * set at login, sent back by the browser on every request, and verified with
 * {@link verifyToken}. Verified claims are stored on `res.locals.auth` and
 * are available to all downstream handlers.
 *
 * Two middleware variants are exported:
 * - `requireAuth` — rejects the request with 401 if no valid token is present.
 * - `optionalAuth` — sets `res.locals.auth` when a token is present, but
 *   allows unauthenticated requests through without error.
 * 
 * `setTokenCookie` and `clearTokenCookie` are used by the login and logout routes.
 */
import { Request, Response, NextFunction, CookieOptions } from 'express';
import { Claims, TOKEN_TTL_SECONDS, verifyToken } from '../auth/crypto.js';
import { Unauthorized } from './errors.js';

// ─── Type augmentation ───────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Locals {
      auth?: Claims; // The verified claims of the authenticated caller, if any.
    }
  }
}

// ─── Cookie ──────────────────────────────────────────────────────────────────

/** Name of the cookie that carries the JWT. */
export const TOKEN_COOKIE = 'jwt';

/**
 * Cookie attributes shared by set and clear (the browser only removes a
 * cookie when path and attributes match the ones it was set with).
 * - `httpOnly`: browser scripts cannot read the token.
 * - `sameSite: 'strict'`: the cookie is not sent on cross-site requests (protects against CSRF).
 * - `secure` is left off so the cookie also works over plain http in development.
 */
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
};

/**
 * Stores a signed JWT in the token cookie on the response.
 *
 * @param res   - The Express response to set the cookie on.
 * @param token - The signed JWT.
 */
export function setTokenCookie(res: Response, token: string): void {
  res.cookie(TOKEN_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: TOKEN_TTL_SECONDS * 1000 });
}

/**
 * Tells the browser to delete the token cookie.
 *
 * @param res - The Express response to clear the cookie on.
 */
export function clearTokenCookie(res: Response): void {
  res.clearCookie(TOKEN_COOKIE, COOKIE_OPTIONS);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reads the token from the token cookie.
 *
 * @param req - The incoming Express request.
 * @returns The token string, `undefined` when the cookie is absent, or `null`
 *   when it is present but not a non-empty string.
 */
function cookieToken(req: Request): string | undefined | null {
  const value: unknown = req.cookies?.[TOKEN_COOKIE];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '') return null;
  return value;
}

/**
 * Verifies a token and writes the claims to `res.locals.auth`.
 * Throws `Unauthorized` when the token is `null`, forged, or expired. 
 * The bad cookie is cleared first, so the browser's next request is 
 * treated as anonymous instead of failing again.
 *
 * @param token - The raw token string, or `null` for a malformed cookie.
 * @param res   - The Express response whose `locals.auth` will be set.
 */
function authenticate(token: string | null, res: Response): void {
  const claims = token === null ? undefined : verifyToken(token);
  if (!claims) {
    clearTokenCookie(res);
    throw new Unauthorized('Invalid or expired token');
  }
  res.locals.auth = claims;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Requires a valid token cookie. Passes `401 Unauthorized` to `next` when
 * the token is missing, malformed, forged, or expired.
 *
 * @param req  - The incoming Express request.
 * @param res  - The Express response; `res.locals.auth` is set on success.
 * @param next - Calls `next()` on success or `next(err)` on failure.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = cookieToken(req);
    if (token === undefined) throw new Unauthorized('Missing token');
    authenticate(token, res);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optionally authenticates the caller. If a token cookie is present it must
 * be valid; a malformed, forged, or expired token still results in `401`.
 * Requests without the cookie are passed through as anonymous.
 *
 * @param req  - The incoming Express request.
 * @param res  - The Express response; `res.locals.auth` is set when a valid token is present.
 * @param next - Calls `next()` on success or `next(err)` on failure.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = cookieToken(req);
    if (token !== undefined) authenticate(token, res);
    next();
  } catch (err) {
    next(err);
  }
}
