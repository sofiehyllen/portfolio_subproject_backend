/**
 * Route handlers for the `/api/titles` collection.
 *
 * `GET /` has four modes, chosen by the query parameters (one mode per request):
 * - `GET /?text=...` — paged substring search (text 1-100 characters, trimmed);
 *   results ordered by tconst. The search
 *   is logged in the user's history on the first page only (offset 0).
 *   Sorting and filtering parameters are rejected with 400 in this mode.
 * - `GET /?keywords=a,b&match=all|any|weighted` — paged keyword search (1-10 keywords,
 *   match defaults to weighted), ranked by the match mode. Logged and restricted like text.
 * - `GET /?title=...&plot=...&character=...&person=...` — paged structured search; each
 *   field at most 100 characters, at least one with text, empty fields ignored. Results
 *   ordered by tconst. Logged and restricted like text.
 * - `GET /` — paged list of all titles. Optional `sort` (title, year, rating, votes,
 *   runtime; default title), `order` (asc, desc; default asc), `genre` and `titleType`.
 *
 * Also: `GET /{tconst}` (one title with genres, rating and credits), and the paged
 * `GET /{tconst}/actors` and `GET /{tconst}/similar`.
 */
import { Router } from 'express';
import * as titles from '../data/titles.js';
import { NotFound, BadRequest } from '../middleware/errors.js';
import { toActorDto, toSimilarMovieDto, toTitleDetailDto, toTitleDto, toTitleSummaryDto } from './dto.js';
import { isStructuredSearch, rejectUnknownTitleParams, validateStructuredSearch, validateTitleBrowse, validateTconst, validateTitleSearch, validateKeywordSearch } from '../validation.js';
import { pageOf, searchLogUser } from "./pagination.js";
import { paged } from "./pagination.js";

/** Router for `/api/titles`, mounted behind `optionalAuth`. */
export const router = Router();

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

/**
 * GET /api/titles
 *
 * Lists or searches titles. The parameters choose one mode per request:
 * - `?text=...` — substring search (1–100 characters), ordered by tconst.
 * - `?keywords=a,b&match=all|any|weighted` — keyword search (1–10 keywords;
 *   `match` defaults to weighted). `match` alone also selects this mode.
 * - `?title=&plot=&character=&person=` — structured search; at least one field must have text.
 * - none of the above — browse all titles, with optional `sort` (title, year, rating,
 *   votes, runtime; default title), `order` (asc, desc; default asc), `genre` and `titleType`.
 *
 * Every mode accepts `limit` and `offset`. A search by a logged-in user is logged
 * in their search history, on the first page only.
 *
 * @returns `200` with `Paged<TitleSummaryDto>` for a search, or `Paged<TitleDto>` when browsing.
 * @throws  `400 Bad Request`  — unknown parameter, parameters from two modes, or an invalid value.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 */
router.get('/', async (req, res, next) => {
  try {
    const query = req.query as Record<string, unknown>;
    rejectUnknownTitleParams(query);
    const page = pageOf(query);

    // Substring search: ?text=...
    if (query.text !== undefined) {
      const text = validateTitleSearch(query);
      const logAs = searchLogUser(page, res.locals.auth?.uconst);
      const { items, total } = await titles.searchText(logAs, text, page.limit, page.offset);
      res.json(paged(req, page, total, items.map(toTitleSummaryDto)));
      return;
    }

    // Keyword search: ?keywords=a,b&match=all|any|weighted
    // (match alone also selects this mode, so it is reported as missing keywords)
    if (query.keywords !== undefined || query.match !== undefined) {
      const { keywords, match } = validateKeywordSearch(query);
      const logAs = searchLogUser(page, res.locals.auth?.uconst);
      const { items, total } = await titles.searchKeywords(logAs, keywords, match, page.limit, page.offset);
      res.json(paged(req, page, total, items.map(toTitleSummaryDto)));
      return;
    }
    // Structured search: ?title=...&plot=...&character=...&person=...
    if (isStructuredSearch(query)) {
      const search = validateStructuredSearch(query);
      const logAs = searchLogUser(page, res.locals.auth?.uconst);
      const { items, total } = await titles.searchStructured(logAs, search, page.limit, page.offset);
      res.json(paged(req, page, total, items.map(toTitleSummaryDto)));
      return;
    }

    // No search: browse all titles, filtered and sorted as asked
    const browse = validateTitleBrowse(query);
    const [items, total] = await Promise.all([
      titles.list(browse, page.limit, page.offset),
      titles.count(browse),
    ]);
    res.json(paged(req, page, total, items.map(toTitleDto)));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/titles/{tconst}
 *
 * One title with genres, rating and credits.
 *
 * @returns `200` with a `TitleDetailDto`.
 * @throws  `400 Bad Request`  — invalid `tconst`.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 * @throws  `404 Not Found`    — no such title.
 */
router.get('/:tconst', async (req, res, next) => {
  try {
    const title = await titles.get(res.locals.tconst);
    if (!title) throw new NotFound('Title not found');

    res.json(toTitleDetailDto(title));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/titles/{tconst}/actors
 *
 * Paged actors of the title, highest name rating first. Accepts `limit` and `offset`.
 *
 * @returns `200` with `Paged<ActorDto>`.
 * @throws  `400 Bad Request`  — invalid `tconst`.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 * @throws  `404 Not Found`    — no such title.
 */
router.get('/:tconst/actors', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record<string, unknown>);
    const result = await titles.actors(res.locals.tconst, page.limit, page.offset);
    if (!result) throw new NotFound('Title not found');

    res.json(paged(req, page, result.total, result.items.map(toActorDto)));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/titles/{tconst}/similar
 *
 * Paged movies sharing genres with the title, most shared genres first.
 * Accepts `limit` and `offset`.
 *
 * @returns `200` with `Paged<SimilarMovieDto>`.
 * @throws  `400 Bad Request`  — invalid `tconst`.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 * @throws  `404 Not Found`    — no such title.
 */
router.get('/:tconst/similar', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record<string, unknown>);
    const result = await titles.similar(res.locals.tconst, page.limit, page.offset);
    if (!result) throw new NotFound('Title not found');

    res.json(paged(req, page, result.total, result.items.map(toSimilarMovieDto)));
  } catch (err) {
    next(err);
  }
});