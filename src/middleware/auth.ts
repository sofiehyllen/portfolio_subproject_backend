/**
 * Express middleware for JWT authentication.
 *
 * Tokens are read from the `Authorization: Bearer <token>` header and
 * verified with {@link verifyToken}. Verified claims are stored on
 * `res.locals.auth` and are available to all downstream handlers.
 *
 * Two middleware variants are exported:
 * - `requireAuth` — rejects the request with 401 if no valid token is present.
 * - `optionalAuth` — sets `res.locals.auth` when a token is present, but
 *   allows unauthenticated requests through without error.
 */
import { Request, Response, NextFunction } from 'express';
import { Claims, verifyToken } from '../auth/crypto.js';
import { Unauthorized } from './errors.js';

// ─── Type augmentation ───────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Locals {
      auth?: Claims; // The verified claims of the authenticated caller, if any.
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts the Bearer token from the `Authorization` header.
 *
 * @param req - The incoming Express request.
 * @returns The token string when the header is a valid `Bearer <token>`,
 *   `undefined` when the header is absent, or `null` when it is present
 *   but malformed.
 */
function bearerToken(req: Request): string | undefined | null {
  const header = req.headers.authorization;
  if (header === undefined) return undefined;
  const [scheme, token, ...rest] = header.split(' ');
  if (scheme !== 'Bearer' || !token || rest.length > 0) return null;
  return token;
}

/**
 * Verifies a token and writes the claims to `res.locals.auth`.
 * Throws `Unauthorized` when the token is `null` (malformed header),
 * forged, or expired.
 *
 * @param token - The raw token string, or `null` for a malformed header.
 * @param res   - The Express response whose `locals.auth` will be set.
 */
function authenticate(token: string | null, res: Response): void {
  const claims = token === null ? undefined : verifyToken(token);
  if (!claims) throw new Unauthorized('Invalid or expired token');
  res.locals.auth = claims;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Requires a valid Bearer token. Passes `401 Unauthorized` to `next` when
 * the token is missing, malformed, forged, or expired.
 *
 * @param req  - The incoming Express request.
 * @param res  - The Express response; `res.locals.auth` is set on success.
 * @param next - Calls `next()` on success or `next(err)` on failure.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = bearerToken(req);
    if (token === undefined) throw new Unauthorized('Missing token');
    authenticate(token, res);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optionally authenticates the caller. If a Bearer token is present it must
 * be valid; a malformed, forged, or expired token still results in `401`.
 * Requests without an `Authorization` header are passed through as anonymous.
 *
 * @param req  - The incoming Express request.
 * @param res  - The Express response; `res.locals.auth` is set when a valid token is present.
 * @param next - Calls `next()` on success or `next(err)` on failure.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = bearerToken(req);
    if (token !== undefined) authenticate(token, res);
    next();
  } catch (err) {
    next(err);
  }
}
