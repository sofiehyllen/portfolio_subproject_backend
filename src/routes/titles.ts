import { Router } from 'express';
import * as titles from '../data/titles.js';
import { NotFound } from '../middleware/errors.js';
import { toTitleDetailDto, toTitleDto } from './dto.js';
import { pageOf } from "./pagination.js";
import { paged } from "./pagination.js";

export const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record<string, unknown>);
    const items = await titles.list(page.limit, page.offset);
    const total = await titles.count();
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