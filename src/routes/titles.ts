import { Router } from 'express';
import * as titles from '../data/titles.js';
import { toTitleDto } from './dto.js';

export const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const data = await titles.titles();
    res.json(data.map(toTitleDto));
  } catch (err) {
    next(err);
  }
});