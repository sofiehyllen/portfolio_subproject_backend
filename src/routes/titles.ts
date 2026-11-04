import { Router } from 'express';
import * as titles from '../data/titles.js';
import { toTitleDto } from './dto.js';
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