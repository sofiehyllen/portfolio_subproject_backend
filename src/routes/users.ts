import { Router } from 'express';
import * as users from '../data/users.js';
import { NotFound } from '../middleware/errors.js';
import { toUserRatingDto, toUserDto, toRatingHistoryDto } from './dto.js';
import * as ratings from '../data/ratings.js';
import { paged, pageOf } from "./pagination.js";

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

// GET /api/users/{uconst}/ratings: paged rating history, newest change first.
router.get('/:uconst/ratings', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const page = pageOf(req.query as Record<string, unknown>);

    const items = await ratings.ratingHistory(uconst, page.limit, page.offset);
    const total = await ratings.countRatings(uconst);

    res.json(paged(req, page, total, items.map((item) => toRatingHistoryDto(uconst, item))));
  } catch (err) {
    next(err)
  }
})

// GET /api/users/{uconst}/ratings/{tconst}: the user's active rating of one title.
// 404 when the user has never rated the title, or the rating has been removed.
router.get('/:uconst/ratings/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const rating = await ratings.getRating(uconst, req.params.tconst);
    if (!rating) throw new NotFound('Rating not found');

    res.json(toUserRatingDto(rating));
  } catch (err) {
    next(err);
  }
});