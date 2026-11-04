import { Router } from 'express';
import * as users from '../data/users.js';
import { NotFound } from '../middleware/errors.js';
import { toUserDto } from './dto.js';

export const router = Router();

// uconst is a SERIAL column, so only positive integers can identify a user.
function parseUconst(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return id <= 2147483647 ? id : undefined; // fits a Postgres integer
}

// Runs before every route in this router whose path contains :uconst, so
// the check is written once. An invalid uconst gets a 400 and the route
// never runs; a valid one is stored in res.locals.uconst as a number.
router.param('uconst', (_req, res, next, value: string) => {
  const uconst = parseUconst(value);
  if (uconst === undefined) {
    res.status(400).json({ error: 'uconst must be a positive integer' });
    return;
  }
  res.locals.uconst = uconst;
  next();
});

// GET /api/users/{uconst}: the user's profile (never the password hash).
// TODO: require a token and check it belongs to {uconst} (401/403) once auth exists.
router.get('/:uconst', async (_req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const user = await users.getUser(uconst);
    if (!user) throw new NotFound('User not found');

    res.json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/{uconst}: deletes the user and all their ratings,
// bookmarks and search history. 204 on success, no body.
// TODO: require a token and check it belongs to {uconst} (401/403) once auth exists.
router.delete('/:uconst', async (_req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const deleted = await users.deleteUser(uconst);
    if (!deleted) throw new NotFound('User not found');

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
