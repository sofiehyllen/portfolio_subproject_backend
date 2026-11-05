import { Request, Response, NextFunction } from 'express';

export class NotFound extends Error {} // Thrown when something it needs does not exist.
export class Conflict extends Error {} // Thrown when the request conflicts with what is stored.
export class BadRequest extends Error {} // Thrown when the request data is invalid or malformed
export class Forbidden extends Error {} // Thrown when the user lacks permission to perform the action

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