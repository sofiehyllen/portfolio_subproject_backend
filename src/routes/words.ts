/**
 * Route handlers for `/api/related-words`.
 */
import { Router } from 'express';
import * as words from '../data/words.js';
import { validateWords } from '../validation.js';
import { pageOf, paged } from './pagination.js';

export const router = Router();

// GET /api/related-words?words=a,b: paged words most associated with the titles
// matching all the given words. Not logged in the search history.
router.get('/', async (req, res, next) => {
  try {
    const query = req.query as Record<string, unknown>;
    const given = validateWords(query.words);
    const page = pageOf(query);

    // The database function always gives its whole list, so the page is cut out here.
    const items = await words.relatedWords(given);
    res.json(paged(req, page, items.length, items.slice(page.offset, page.offset + page.limit)));
  } catch (err) {
    next(err);
  }
});
