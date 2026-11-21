/**
 * Route handlers for `/api/related-words`.
 */
import { Router } from 'express';
import * as words from '../data/words.js';
import { validateWords } from '../validation.js';
import { pageOf, paged } from './pagination.js';

/** Router for `/api/related-words`. Public: no login needed. */
export const router = Router();

/**
 * GET /api/related-words?words=a,b
 *
 * Paged words most associated with the titles that contain all the given words,
 * most frequent first. Not logged in the search history. The database function
 * returns its whole list (at most 10 words), so the page is cut out here.
 *
 * @query   `words` — comma-separated list of 1–10 words, each 1–50 characters;
 *          `limit`, `offset`.
 * @returns `200` with `Paged<{ word, count }>`.
 * @throws  `400 Bad Request` — `words` missing, sent twice, or breaking the limits.
 */
router.get('/', async (req, res, next) => {
  try {
    const query = req.query as Record<string, unknown>;
    const given = validateWords(query.words);
    const page = pageOf(query);

    // The database function always gives its whole list, so the page is cut out here.
    const items = await words.related(given);
    res.json(paged(req, page, items.length, items.slice(page.offset, page.offset + page.limit)));
  } catch (err) {
    next(err);
  }
});
