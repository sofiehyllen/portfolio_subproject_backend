import { Router } from 'express';
import * as users from '../data/users.js';
import { NotFound } from '../middleware/errors.js';
import { hashPassword } from '../password.js';
import { validateNewUser } from '../validation.js';
import { toUserDto, uri } from './dto.js';

export const router = Router();

// POST /api/users: registers a user. Public. Returns 201 with the new
// profile and a Location header pointing at it.
router.post('/', async (req, res, next) => {
  try {
    const input = validateNewUser(req.body); // 400 on missing or invalid fields
    const uconst = await users.createUser({
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      email: input.email,
      passwordHash: await hashPassword(input.password), // the plain password is never stored
    }); // 409 on duplicate username or email

    const user = await users.getUser(uconst);
    if (!user) throw new Error(`user ${uconst} missing right after create`);

    res.status(201).location(uri.user(uconst)).json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

// uconst is a SERIAL column, so only positive integers can identify a user.
function parseUconst(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return id <= 2147483647 ? id : undefined; // fits a Postgres integer
}

// GET /api/users/{uconst}: the user's profile (never the password hash).
// TODO: require a token and check it belongs to {uconst} (401/403) once auth exists.
router.get('/:uconst', async (req, res, next) => {
  try {
    const uconst = parseUconst(req.params.uconst);
    if (uconst === undefined) {
      res.status(400).json({ error: 'uconst must be a positive integer' });
      return;
    }

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
router.delete('/:uconst', async (req, res, next) => {
  try {
    const uconst = parseUconst(req.params.uconst);
    if (uconst === undefined) {
      res.status(400).json({ error: 'uconst must be a positive integer' });
      return;
    }

    const deleted = await users.deleteUser(uconst);
    if (!deleted) throw new NotFound('User not found');

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
