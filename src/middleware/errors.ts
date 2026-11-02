import { Request, Response, NextFunction } from 'express';

export class NotFound extends Error {} // Thrown when something it needs does not exist.
export class Conflict extends Error {} // Thrown when the request conflicts with what is stored.

export function errorHandler(
  err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof NotFound) { res.status(404).json({ error: err.message }); return; }
  if (err instanceof Conflict) { res.status(409).json({ error: err.message }); return; }
  if (err.status === 400) { res.status(400).json({ error: 'invalid JSON body' }); return; }
  console.error(err);
  res.status(500).json({ error: 'internal error' });
}