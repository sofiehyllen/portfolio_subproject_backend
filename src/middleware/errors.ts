import { Request, Response, NextFunction } from 'express';

export class NotFound extends Error {} // Thrown when something it needs does not exist.
export class Conflict extends Error {} // Thrown when the request conflicts with what is stored.
export class BadRequest extends Error {} // Thrown when the request data is invalid or malformed
export class Forbidden extends Error {} // Thrown when the user lacks permission to perform the action

// TODO: use the error shape from docs/api-design.md section 5 for every error:
//   { "status": 404, "error": "Not Found", "message": "User not found" }
// Every response below still sends only { "error": "<message>" }. Two places
// send errors without going through this handler and must change too: the
// 404 fallback for unknown paths in app.ts, and the 400 for an invalid uconst
// in routes/users.ts (throwing BadRequest there would route it through here).
// Also add 401 and 403 here when authentication is implemented.
export function errorHandler(
  err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof NotFound)    { res.status(404).json({ error: err.message }); return; }
  if (err instanceof Conflict)    { res.status(409).json({ error: err.message }); return; }
  if (err instanceof BadRequest)  { res.status(400).json( {error: err.message});  return; }
  if (err instanceof Forbidden)   { res.status(403).json( {error: err.message});  return; }
  if (err.status === 400)         { res.status(400).json({ error: 'invalid JSON body' }); return; }
  console.error(err);
  res.status(500).json({ error: 'internal error' });
}