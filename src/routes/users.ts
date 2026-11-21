/**
 * Route handlers for the `/api/users` collection: profile, password, ratings,
 * bookmarks and search history.
 *
 * Two routers, so the guard is named where they are mounted (`app.ts`):
 * - `registrationRouter` — public; only `POST /api/users`.
 * - `router` — every other route; mounted behind `requireAuth`.
 *
 * Every route with `:uconst` works only on the caller's own account; the
 * `uconst` param handler checks this before the route runs.
 */
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
import { clearTokenCookie } from "../middleware/auth.js";

/** Public router: only `POST /api/users` (registration). */
export const registrationRouter = Router();
/** Router for every other `/api/users` route; mounted behind `requireAuth`. */
export const router = Router();

/**
 * Runs before every route whose path contains `:uconst`, so validation and
 * authorization are written once. On success, stores the parsed id in
 * `res.locals.uconst` and the user row in `res.locals.user`.
 *
 * @throws `400 Bad Request` — `uconst` is not a positive integer.
 * @throws `403 Forbidden`   — `uconst` is not the logged-in user's id.
 * @throws `404 Not Found`   — no such user.
 */
router.param('uconst', async (_req, res, next, value: string) => {
  try {
    const uconst = validateSerial(value);
    if (uconst === undefined) { throw new BadRequest('uconst must be a positive integer'); }

    if (res.locals.auth?.uconst !== uconst) throw new Forbidden('Not your account');

    const user = await users.get(uconst);
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

/**
 * Validates the `:sconst` route parameter and stores it in `res.locals.sconst`.
 *
 * @throws `400 Bad Request` — `sconst` is not a positive integer.
 */
router.param('sconst', (_req, res, next, value: string) => {
  const sconst = validateSerial(value);
  if (sconst === undefined){
    return next( new BadRequest('sconst must be a positive integer'));
  }
  res.locals.sconst = sconst;
  next();
});

/**
 * Validates the `:tconst` route parameter and stores it in `res.locals.tconst`.
 *
 * @throws `400 Bad Request` — not `tt` followed by 7–8 digits.
 */
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

/**
 * POST /api/users
 *
 * Registers a user. Public.
 *
 * @body    `{ firstName, lastName, username, email, password }`.
 * @returns `201` with the new `UserDto` and a `Location` header pointing at it.
 * @throws  `400 Bad Request` — missing or invalid fields, or the password breaks the rules.
 * @throws  `409 Conflict`    — username or email already taken.
 */
registrationRouter.post('/', async (req, res, next) => {
  try {
    const input = validateNewUser(req.body); // 400 on missing or invalid fields
    const user = await register(input); // 409 from the service
    res.status(201).location(uri.user(user.uconst)).json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/{uconst}
 *
 * The user's profile (never the password hash).
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `200` with a `UserDto`.
 */
router.get('/:uconst', (_req, res) => {
  const user: users.User = res.locals.user;
  res.json(toUserDto(user));
});

/**
 * PATCH /api/users/{uconst}
 *
 * Changes the fields sent and returns the updated profile. The username cannot
 * be changed, and the password has its own endpoint.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @body    Any of `{ firstName, lastName, email }`; at least one.
 * @returns `200` with the updated `UserDto`.
 * @throws  `400 Bad Request` — invalid, unknown or forbidden field, or no field sent.
 * @throws  `409 Conflict`    — email already used by another user.
 */
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

/**
 * PUT /api/users/{uconst}/password
 *
 * Replaces the user's password.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @body    `{ currentPassword, newPassword }`.
 * @returns `204` with no body.
 * @throws  `400 Bad Request` — a password is missing, or the new one breaks the rules
 *          (including matching the username or the current password).
 * @throws  `403 Forbidden`   — `currentPassword` is wrong.
 */
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

/**
 * DELETE /api/users/{uconst}
 *
 * Deletes the user and all their ratings, bookmarks and search history.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `204` with no body.
 * @throws  `404 Not Found` — the user was already gone.
 */
router.delete('/:uconst', async (_req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const deleted = await users.remove(uconst);
    if (!deleted) throw new NotFound('User not found');
    clearTokenCookie(res)
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});


// ── Ratings ───────────────────────────────────────────────────────────────────

/**
 * GET /api/users/{uconst}/ratings
 *
 * Paged rating history, newest change first. Accepts `limit` and `offset`.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `200` with `Paged<RatingHistoryDto>`.
 */
router.get('/:uconst/ratings', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const page = pageOf(req.query as Record<string, unknown>);

    const [items, total] = await Promise.all([
      ratings.list(uconst, page.limit, page.offset),
      ratings.count(uconst),
    ]);

    res.json(paged(req, page, total, items.map((item) => toRatingHistoryDto(uconst, item))));
  } catch (err) {
    next(err)
  }
});

/**
 * GET /api/users/{uconst}/ratings/{tconst}
 *
 * The user's active rating of one title.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `200` with a `UserRatingDto`.
 * @throws  `400 Bad Request` — invalid `tconst`.
 * @throws  `404 Not Found`   — the user has never rated the title, or the rating was removed.
 */
router.get('/:uconst/ratings/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const rating = await ratings.get(uconst, res.locals.tconst);
    if (!rating) throw new NotFound('Rating not found');

    res.json(toUserRatingDto(rating));
  } catch (err) {
    next(err);
  }
});


/**
 * PUT /api/users/{uconst}/ratings/{tconst}
 *
 * Creates or changes the user's rating of a title.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @body    `{ rating }` — an integer from 1 to 10.
 * @returns `201` with the `UserRatingDto` when the rating is new, `200` when it was changed.
 * @throws  `400 Bad Request` — invalid `tconst` or `rating`.
 * @throws  `404 Not Found`   — no such title.
 */
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

/**
 * DELETE /api/users/{uconst}/ratings/{tconst}
 *
 * Removes the user's rating of a title (soft delete); the vote is taken out of
 * the title's average.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `204` with no body.
 * @throws  `400 Bad Request` — invalid `tconst`.
 * @throws  `404 Not Found`   — the user has no active rating of the title.
 */
router.delete('/:uconst/ratings/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = res.locals.tconst;

    const deleted = await ratings.remove(uconst, tconst);   // true if a rating was removed
    if (!deleted) throw new NotFound('Rating not found');

    res.status(204).end();
  } catch (err) {
    next(err)
  }
});


// ── Bookmarks ─────────────────────────────────────────────────────────────────

/**
 * GET /api/users/{uconst}/bookmarks/titles
 *
 * Paged title bookmarks, newest first. Accepts `limit` and `offset`.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `200` with `Paged<UserBookmarkTitleDto>`.
 */
router.get('/:uconst/bookmarks/titles', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record <string, unknown>);
    const uconst: number = res.locals.uconst;

    const [items, total] = await Promise.all([
      bookmark.listTitles(uconst, page.limit, page.offset),
      bookmark.countTitles(uconst),
    ]);

    res.json(paged(req, page, total, items.map((item) => toUserBookmarkTitleDto(uconst, item))));

  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/{uconst}/bookmarks/titles/{tconst}
 *
 * Bookmarks a title.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `204` with no body.
 * @throws  `400 Bad Request` — invalid `tconst`.
 * @throws  `404 Not Found`   — no such title.
 */
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

/**
 * DELETE /api/users/{uconst}/bookmarks/titles/{tconst}
 *
 * Removes a title bookmark.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `204` with no body.
 * @throws  `400 Bad Request` — invalid `tconst`.
 * @throws  `404 Not Found`   — the user has not bookmarked the title.
 */
router.delete('/:uconst/bookmarks/titles/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = res.locals.tconst;
    const deleted = await bookmark.removeTitle(uconst, tconst);
    if (!deleted) {
      throw new NotFound('Bookmarked title not found');
    }

    res.status(204).end();

  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/{uconst}/bookmarks/persons
 *
 * Paged person bookmarks, newest first. Accepts `limit` and `offset`.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `200` with `Paged<UserBookmarkPersonDto>`.
 */
router.get('/:uconst/bookmarks/persons', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record <string, unknown>);

    const uconst: number = res.locals.uconst;

    const [items, total] = await Promise.all([
      bookmark.listPersons(uconst, page.limit, page.offset),
      bookmark.countPersons(uconst),
    ]);

    res.json(paged(req, page, total, items.map((item) => toUserBookmarkPersonDto(uconst, item))));

  } catch (err) {
    next(err)
  }
});

/**
 * PUT /api/users/{uconst}/bookmarks/persons/{nconst}
 *
 * Bookmarks a person.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `204` with no body.
 * @throws  `400 Bad Request` — invalid `nconst`.
 * @throws  `404 Not Found`   — no such person.
 */
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

/**
 * DELETE /api/users/{uconst}/bookmarks/persons/{nconst}
 *
 * Removes a person bookmark.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `204` with no body.
 * @throws  `400 Bad Request` — invalid `nconst`.
 * @throws  `404 Not Found`   — the user has not bookmarked the person.
 */
router.delete('/:uconst/bookmarks/persons/:nconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const nconst = res.locals.nconst;
    const deleted = await bookmark.removePerson(uconst, nconst);
    if (!deleted) {
      throw new NotFound('Bookmarked person not found');
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});


// ── Search history ────────────────────────────────────────────────────────────

/**
 * GET /api/users/{uconst}/search-history
 *
 * Paged search history, newest first. Accepts `limit` and `offset`.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `200` with `Paged<UserSearchHistoryDto>`.
 */
router.get('/:uconst/search-history', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;

    const page = pageOf(req.query);
    const {items, total} = await search_history.list(uconst, page.limit, page.offset);

    res.json(paged(req, page, total, toUserSearchHistoryDto(items, uconst)));

  } catch (err){
    next (err);
  }
});

/**
 * DELETE /api/users/{uconst}/search-history/{sconst}
 *
 * Deletes one search history entry.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `204` with no body.
 * @throws  `400 Bad Request` — invalid `sconst`.
 * @throws  `404 Not Found`   — the user has no such entry.
 */
router.delete('/:uconst/search-history/:sconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const sconst: number = res.locals.sconst;
    const deleted = await search_history.remove(uconst, sconst);
    if (!deleted) throw new NotFound('Search history entry was not found');

    res.status(204).end();
  } catch (error) {
    next(error)
  }
});

/**
 * DELETE /api/users/{uconst}/search-history
 *
 * Deletes the user's entire search history. Clearing an empty history is not
 * an error, so the answer is always `204`.
 * Own account only: `401` without a valid token; `400`/`403`/`404` from the `uconst` param handler.
 *
 * @returns `204` with no body.
 */
router.delete('/:uconst/search-history', async (_req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    await search_history.clear(uconst);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
