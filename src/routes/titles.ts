import { Router } from 'express';
import * as titles from '../data/titles.js';
import { toTitleDto } from './dto.js';
import { pageOf } from "../validation.js";

export const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = pageOf(req.query as Record<string, unknown>);
    const items = await titles.list(limit, offset);
    const total = await titles.count();
    res.json({ total, limit, offset, items: items.map(toTitleDto) });
  } catch (err) {
    next(err);
  }
});