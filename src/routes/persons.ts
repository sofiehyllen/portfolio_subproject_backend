import { Router } from 'express';
import * as persons from '../data/persons.js';
import * as error from '../middleware/errors.js';
import { pageOf, paged} from '../routes/pagination.js'

export const router = Router();

router.get('/', async (req, res, next) => {
    try {
        const page = pageOf(req.query);
        const {items, total} =  await persons.persons(page.limit, page.offset);

        res.json(paged(req, page, total, toPersonsDto(items)));

    } catch (error) {
        next(error);
    }
});



