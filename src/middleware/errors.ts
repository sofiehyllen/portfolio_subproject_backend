/**
 * HTTP error classes and the Express error-handling middleware.
 *
 * Route handlers and middleware throw one of the typed error classes below;
 * `errorHandler` catches them and sends a uniform JSON response:
 * `{ "status": 404, "error": "Not Found", "message": "..." }`.
 *
 * Error classes and their HTTP status codes:
 * - `BadRequest`   → 400 — invalid or malformed request data.
 * - `Unauthorized` → 401 — missing or invalid authentication token.
 * - `Forbidden`    → 403 — authenticated but not permitted to perform the action.
 * - `NotFound`     → 404 — a required resource does not exist.
 * - `Conflict`     → 409 — the request conflicts with the current state.
 */
import { STATUS_CODES } from 'node:http';
import { Request, Response, NextFunction } from 'express';

// ─── Error classes ────────────────────────────────────────────────────────────
/**
 * Invalid or malformed request data. Sent as `400 Bad Request`
 */
export class BadRequest   extends Error {}
/**
 * Missing, malformed, forged or expired token. Sent as `401 Unauthorized`
 */
export class Unauthorized extends Error {}
/**
 * Logged in, but not allowed to do this (e.g. another user's account). Sent as `403 Forbidden`
 */
export class Forbidden    extends Error {}
/**
 * A required resource does not exist. Sent as `404 Not Found`
 */
export class NotFound     extends Error {}
/**
 * The request conflicts with the current state (e.g. username taken). Sent as `409 Conflict`
 */
export class Conflict     extends Error {}

// ─── Error handler ────────────────────────────────────────────────────────────

/**
 * Sends a JSON error response with a consistent shape.
 *
 * @param res     - The Express response to write to.
 * @param status  - The HTTP status code.
 * @param message - A human-readable description of the error.
 */
function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ status, error: STATUS_CODES[status] ?? 'Error', message });
}

/**
 * Express error-handling middleware. Must be registered last so it catches
 * errors forwarded by `next(err)` from all preceding middleware and routes.
 *
 * Typed errors are mapped to their HTTP status codes. Errors from
 * `express.json()` (400, 413, 415) are forwarded as-is. Anything else
 * is treated as an unexpected server error, logged, and returned as 500.
 *
 * @param err  - The error forwarded via `next(err)`.
 * @param _req - Unused; required by Express's four-argument error-handler signature.
 * @param res  - The Express response to write to.
 * @param _next - Unused; required by Express's four-argument error-handler signature.
 */
export function errorHandler(
  err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof BadRequest)    { sendError(res, 400, err.message); return; }
  if (err instanceof Unauthorized)  { sendError(res, 401, err.message); return; }
  if (err instanceof Forbidden)     { sendError(res, 403, err.message); return; }
  if (err instanceof NotFound)      { sendError(res, 404, err.message); return; }
  if (err instanceof Conflict)      { sendError(res, 409, err.message); return; }

  // Errors from express.json(): invalid JSON (400), body too large (413), wrong encoding (415).
  if (err.status === 400) { sendError(res, 400, 'Invalid JSON body'); return; }
  if (err.status && err.status >= 400 && err.status < 500) { sendError(res, err.status, err.message); return; }

  // Anything else is a bug or a database error.
  console.error(err);
  sendError(res, 500, 'Internal error');
}
