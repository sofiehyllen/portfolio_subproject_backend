import { Router } from 'express';
import * as users from '../data/users.js';
import { validateNewUser, validateUserUpdate } from '../validation.js';
import { toUserRatingDto, toUserDto, uri, toUserSearchHistoryDto } from './dto.js';
import { NotFound, BadRequest, Forbidden } from '../middleware/errors.js';
import * as ratings from '../data/ratings.js';
import { checkPassword, hashPassword } from '../utils/passwords.js';
import * as search_history from '../data/search_history.js';
import { pageOf, paged } from './pagination.js';

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

router.param('sconst', (_req, res, next, value: string) => {
  const sconst = parseUconst(value);
  if (sconst === undefined){
    return next(new BadRequest('sconst must be a positive integer'));
  }
  res.locals.sconst = sconst;
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

// PATCH /api/users/{uconst}: changes the fields sent (firstName, lastName,
// email) and returns the updated profile. The username cannot be changed,
// and the password has its own endpoint.
// TODO: require a token and check it belongs to {uconst} (401/403) once auth exists.
router.patch('/:uconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const changes = validateUserUpdate(req.body); // 400 on invalid or forbidden fields
    const updated = await users.updateUser(uconst, changes); // 409 when the email is taken
    if (!updated) throw new NotFound('User not found');

    const user = await users.getUser(uconst);
    if (!user) throw new Error(`user ${uconst} missing right after update`);

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

// PUT /api/users/{uconst}/ratings/{tconst}: creates or changes the user's rating of a title.
router.put('/:uconst/ratings/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = req.params.tconst;
    const rating = req.body?.rating;
    
    // Check the input before asking the database
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      res.status(400).json({ error: 'rating must be an integer between 1 and 10' });
      return;
    }

    // saves the rating and updates the averages
    const result = await ratings.rateTitle(uconst, tconst, rating);
    if (!result) throw new NotFound('Title not found');

    res.status(result.created ? 201 : 200).json(toUserRatingDto(result.rating)); // new: 201, changed: 200

  } catch (err) {
    next(err)
  }
});

// DELETE /api/users/{uconst}/ratings/{tconst}: removes the user's rating of a title (soft delete).
router.delete('/:uconst/ratings/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = req.params.tconst;

    const deleted = await ratings.deleteRating(uconst, tconst);   // true if a rating was removed
    if (!deleted) throw new NotFound('Rating not found');

    res.status(204).end();
  } catch (err) {
    next(err)
  }
});

// PUT /api/users/{uconst}/password: replaces the user's password
router.put('/:uconst/password', async (req, res, next) => {
  // TODO: require a token and check it belongs to {uconst} once auth exists
  try {
    const {currentPassword, newPassword} = req.body ?? {};
    const uconst: number = res.locals.uconst;

    if (!currentPassword || 
        !newPassword || 
        typeof currentPassword !== 'string' || 
        typeof newPassword !== 'string') 
        throw new BadRequest('Current and new passwords are required');
    
    const user = await users.getUser(uconst);
    if (!user) throw new NotFound('User not found'); 

    const isPasswordValid = await checkPassword(currentPassword, user.passwordHash);
    if (!isPasswordValid) throw new Forbidden('Current password is invalid');

    const newHash = await hashPassword(newPassword);

    await users.updateUserHashPassword(uconst, newHash);
    
    return res.status(204).end();
  }catch (err) {
    next(err);
  }
});

// GET /api/users/{uconst}/search-history: a user's list of search history
// TODO: require a token and check it belongs to {uconst} (401/403) once auth exists.
router.get('/:uconst/search-history', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;

    const page = pageOf(req.query);
    const {items, total} = await search_history.getUserSearchHistory(uconst, page.limit, page.offset);

    res.json(paged(req, page, total, toUserSearchHistoryDto(items, uconst)));

  } catch (err){
    next (err);
  }

});

// DELETE /api/users/{uconst}/search-history/{sconst}: delete a specific search-history entry
router.delete('/:uconst/search-history/:sconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const sconst: number = res.locals.sconst;
    const deleted = await search_history.deleteUserSearchHistoryEntry(uconst, sconst);
    if (!deleted) throw new NotFound('Search history entry was not found');

    res.status(204).end();
  } catch (error) {
    next(error)
  }
});

// DELETE /api/users/{uconst}/search-history: delete user's search history
// TODO: require a token and check it belongs to {uconst} (401/403) once auth exists.
router.delete('/:uconst/search-history', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    await search_history.deleteUserSearchHistory(uconst);
    res.status(204).end();
  } catch (error) {
    next(error)
  }
});