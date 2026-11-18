import { Router } from 'express';
import * as users from '../data/users.js';
import * as bookmark from '../data/bookmarks.js';
import { validateNewUser, validateUserUpdate, validatePasswordUpdate, validateNconst, validateSerial, validateTconst, validateRating, validatePassword  } from '../validation.js';
import { toUserRatingDto, toUserDto, uri, toUserSearchHistoryDto, toRatingHistoryDto, toUserBookmarkTitleDto, toUserBookmarkPersonDto } from './dto.js';
import { NotFound, BadRequest, Forbidden } from '../middleware/errors.js';
import * as ratings from '../data/ratings.js';
import * as search_history from '../data/search_history.js';
import { pageOf, paged } from './pagination.js';
import { rateTitle } from "../services/ratings.js";
import { changePassword, register, updateProfile } from "../services/users.js";
import { bookmarkPerson, bookmarkTitle } from "../services/bookmarks.js";
import { requireAuth } from "../middleware/auth.js";

export const router = Router();

// Runs before every route in this router whose path contains :uconst, so
// the checks are written once. An invalid uconst gets a 400, an unknown
// user a 404, and the route never runs. A valid uconst is stored in
// res.locals.uconst and the user in res.locals.user.
router.param('uconst', async (_req, res, next, value: string) => {
  try {
    const uconst = validateSerial(value);
    if (uconst === undefined) { throw new BadRequest('uconst must be a positive integer'); }

    if (res.locals.auth?.uconst !== uconst) throw new Forbidden('Not your account');

    const user = await users.getUser(uconst);
    if (!user) {
      return next(new NotFound('User not found'));
    }

    res.locals.uconst = uconst;
    res.locals.user = user;
    next();
  } catch(err) {
    next(err);
  }
});

router.param('sconst', (_req, res, next, value: string) => {
  const sconst = validateSerial(value);
  if (sconst === undefined){
    return next( new BadRequest('sconst must be a positive integer'));
  }
  res.locals.sconst = sconst;
  next();
});

router.param('tconst', (_req, res, next, value: string) => {
  const tconst = validateTconst(value);

  if (tconst === undefined) {
    return next( new BadRequest('tconst must start with tt followed by 7-8 digits'));
  }
  res.locals.tconst = tconst;
  next();
});

router.param('nconst', (_req, res, next, value: string) => {
  const nconst = validateNconst(value);

  if (nconst === undefined) {
    return next( new BadRequest('nconst must start with nm followed by 7-8 digits'));
  }
  res.locals.nconst = nconst;
  next();
});

// ── User profile ─────────────────────────────────────────────────────────────

// POST /api/users: registers a user. Public. Returns 201 with the new
// profile and a Location header pointing at it.
router.post('/', async (req, res, next) => {
  router.use(requireAuth);
  try {
    const input = validateNewUser(req.body); // 400 on missing or invalid fields
    const user = await register(input); // 409 from the service
    res.status(201).location(uri.user(user.uconst)).json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

// GET /api/users/{uconst}: the user's profile (never the password hash).
router.get('/:uconst', (_req, res) => {
  const user: users.User = res.locals.user;
  res.json(toUserDto(user));
});

// PATCH /api/users/{uconst}: changes the fields sent (firstName, lastName,
// email) and returns the updated profile. The username cannot be changed,
// and the password has its own endpoint.
router.patch('/:uconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const changes = validateUserUpdate(req.body); // 400 on invalid or forbidden fields
    const user = await updateProfile(uconst, changes); // 404, 409 from the service
    res.json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/{uconst}/password: replaces the user's password
router.put('/:uconst/password', async (req, res, next) => {
  try {
    const input = validatePasswordUpdate(req.body);
    const user: users.User = res.locals.user;

    const errors = validatePassword(input.newPassword, {
      username: user.username,
      currPassword: input.currentPassword,
    });
    if (errors.length > 0) throw new BadRequest(errors.join('; '));

    await changePassword(user.uconst, input); // 403, 404 from the service
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/{uconst}: deletes the user and all their ratings,
// bookmarks and search history. 204 on success, no body.
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


// ── Ratings ───────────────────────────────────────────────────────────────────

// GET /api/users/{uconst}/ratings: paged rating history, newest change first.
router.get('/:uconst/ratings', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const page = pageOf(req.query as Record<string, unknown>);

    const [items, total] = await Promise.all([
      ratings.ratingHistory(uconst, page.limit, page.offset),
      ratings.countRatings(uconst),
    ]);

    res.json(paged(req, page, total, items.map((item) => toRatingHistoryDto(uconst, item))));
  } catch (err) {
    next(err)
  }
});

// GET /api/users/{uconst}/ratings/{tconst}: the user's active rating of one title.
// 404 when the user has never rated the title, or the rating has been removed.
router.get('/:uconst/ratings/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const rating = await ratings.getRating(uconst, res.locals.tconst);
    if (!rating) throw new NotFound('Rating not found');

    res.json(toUserRatingDto(rating));
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/{uconst}/ratings/{tconst}: creates or changes the user's rating of a title.
router.put('/:uconst/ratings/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = res.locals.tconst;
    const rating = validateRating(req.body);

    const result = await rateTitle(uconst, tconst, rating); // 404 from the service

    res.status(result.created ? 201 : 200).json(toUserRatingDto(result.rating)); // new: 201, changed: 200
  } catch (err) {
    next(err)
  }
});

// DELETE /api/users/{uconst}/ratings/{tconst}: removes the user's rating of a title (soft delete).
router.delete('/:uconst/ratings/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = res.locals.tconst;

    const deleted = await ratings.deleteRating(uconst, tconst);   // true if a rating was removed
    if (!deleted) throw new NotFound('Rating not found');

    res.status(204).end();
  } catch (err) {
    next(err)
  }
});


// ── Bookmarks ─────────────────────────────────────────────────────────────────

// GET /api/users/{uconst}/bookmarks/titles
router.get('/:uconst/bookmarks/titles', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record <string, unknown>);
    const uconst: number = res.locals.uconst;

    const [items, total] = await Promise.all([
      bookmark.getTitleBookmarks(uconst, page.limit, page.offset),
      bookmark.countTitleBookmarks(uconst),
    ]);

    res.json(paged(req, page, total, items.map((item) => toUserBookmarkTitleDto(uconst, item))));

  } catch (err) {
    next(err);
  }
});

// PUT /api/users/{uconst}/bookmarks/titles/{tconst}
router.put('/:uconst/bookmarks/titles/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = res.locals.tconst;
    await bookmarkTitle(uconst, tconst); // 404 from the service

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/{uconst}/bookmarks/titles/{tconst}
router.delete('/:uconst/bookmarks/titles/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = res.locals.tconst;
    const deleted = await bookmark.removeTitleBookmark(uconst, tconst);
    if (!deleted) {
      throw new NotFound('Bookmarked title not found');
    }

    res.status(204).end();

  } catch (err) {
    next(err);
  }
});

// GET /api/users/{uconst}/bookmarks/persons
router.get('/:uconst/bookmarks/persons', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record <string, unknown>);

    const uconst: number = res.locals.uconst;

    const [items, total] = await Promise.all([
      bookmark.getPersonBookmarks(uconst, page.limit, page.offset),
      bookmark.countPersonBookmarks(uconst),
    ]);

    res.json(paged(req, page, total, items.map((item) => toUserBookmarkPersonDto(uconst, item))));

  } catch (err) {
    next(err)
  }
});

// PUT /api/users/{uconst}/bookmarks/persons/{nconst}
router.put('/:uconst/bookmarks/persons/:nconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const nconst = res.locals.nconst;
    await bookmarkPerson(uconst, nconst); // 404 from the service

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/{uconst}/bookmarks/persons/{nconst}
router.delete('/:uconst/bookmarks/persons/:nconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const nconst = res.locals.nconst;
    const deleted = await bookmark.removePersonBookmark(uconst, nconst);
    if (!deleted) {
      throw new NotFound('Bookmarked person not found');
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});


// ── Search history ────────────────────────────────────────────────────────────

// GET /api/users/{uconst}/search-history: a user's list of search history
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
// Clearing an empty history is not an error, so the answer is always 204.
router.delete('/:uconst/search-history', async (_req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    await search_history.deleteUserSearchHistory(uconst);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
