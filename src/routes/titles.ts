/**
 * Route handlers for the `/api/titles` collection.
 *
 * Exposes one endpoint with two modes:
 * - `GET /?text=...` — paged substring search; results ordered by tconst. The search
 *   is logged in the user's history on the first page only (offset 0).
 *   Sorting and filtering parameters are rejected with 400 in this mode.
 * - `GET /` — paged list of all titles. Optional `sort` (title, year, rating, votes,
 *   runtime; default title), `order` (asc, desc; default asc), `genre` and `titleType`.
 */
import { Router } from 'express';
import * as titles from '../data/titles.js';
import { NotFound } from '../middleware/errors.js';
import { toActorDto, toSimilarMovieDto, toTitleDetailDto, toTitleDto, toTitleSummaryDto } from './dto.js';
import { rejectBrowseParams, validateTitleBrowse } from '../validation.js';
import { pageOf, searchLogUser } from "./pagination.js";
import { paged } from "./pagination.js";

export const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const query = req.query as Record<string, unknown>;
    const page = pageOf(query);

    // Substring search: ?text=...
    if (typeof req.query.text === 'string') {
      rejectBrowseParams(query);
      const logAs = searchLogUser(page, res.locals.uconst as number | undefined);
      const { items, total } = await titles.searchText(logAs, req.query.text, page.limit, page.offset);
      res.json(paged(req, page, total, items.map(toTitleSummaryDto)));
      return;
    }

    // No search: browse all titles, filtered and sorted as asked
    const browse = validateTitleBrowse(query);
    const items = await titles.list(browse, page.limit, page.offset);
    const total = await titles.count(browse);
    res.json(paged(req, page, total, items.map(toTitleDto)));
  } catch (err) {
    next(err);
  }
});

// GET /api/titles/{tconst}: one title with genres, rating and credits.
router.get('/:tconst', async (req, res, next) => {
  try {
    const title = await titles.get(req.params.tconst);
    if (!title) throw new NotFound('Title not found');

    res.json(toTitleDetailDto(title));
  } catch (err) {
    next(err);
  }
});

// GET /api/titles/{tconst}/actors: paged actors of the title, highest name rating first.
router.get('/:tconst/actors', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record<string, unknown>);
    const result = await titles.actors(req.params.tconst, page.limit, page.offset);
    if (!result) throw new NotFound('Title not found');

    res.json(paged(req, page, result.total, result.items.map(toActorDto)));
  } catch (err) {
    next(err);
  }
});

// GET /api/titles/{tconst}/similar: paged movies sharing genres with the title, most shared first.
router.get('/:tconst/similar', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record<string, unknown>);
    const result = await titles.similar(req.params.tconst, page.limit, page.offset);
    if (!result) throw new NotFound('Title not found');

    res.json(paged(req, page, result.total, result.items.map(toSimilarMovieDto)));
  } catch (err) {
    next(err);
  }
});