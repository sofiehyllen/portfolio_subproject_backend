import { STATUS_CODES } from 'node:http';
import { Request, Response, NextFunction } from 'express';

export class NotFound extends Error {} // Thrown when something it needs does not exist.
export class Conflict extends Error {} // Thrown when the request conflicts with what is stored.
export class BadRequest extends Error {} // Thrown when the request data is invalid or malformed
export class Forbidden extends Error {} // Thrown when the user lacks permission to perform the action

// Every error response has the same shape:
//   { "status": 404, "error": "Not Found", "message": "User not found" }
function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ status, error: STATUS_CODES[status] ?? 'Error', message });
}

// TODO: add 401 here when authentication is implemented.
export function errorHandler(
  err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof NotFound)   { sendError(res, 404, err.message); return; }
  if (err instanceof Conflict)   { sendError(res, 409, err.message); return; }
  if (err instanceof BadRequest) { sendError(res, 400, err.message); return; }
  if (err instanceof Forbidden)  { sendError(res, 403, err.message); return; }

  // Errors from express.json(): invalid JSON (400), body too large (413), wrong encoding (415)
  if (err.status === 400) { sendError(res, 400, 'Invalid JSON body'); return; }
  if (err.status && err.status >= 400 && err.status < 500) { sendError(res, err.status, err.message); return; }

  // Anything else is a bug or a database error:
  console.error(err);
  sendError(res, 500, 'Internal error');
}