import { Router } from 'express';
import * as persons from '../data/persons.js';
import * as error from '../middleware/errors.js';
import { pageOf, paged} from '../routes/pagination.js'
import { toPersonsDto } from './dto.js';

export const router = Router();

function parseUconst(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return id <= 2147483647 ? id : undefined; // fits a Postgres integer
}
router.param('nconst', (_req, res, next, value: string) => {
    const nconst = parseUconst(value);
    if (nconst === undefined) {
        return next(new error.BadRequest('sconst must be a positive integer'));
        return;
    }
    res.locals.uconst = nconst;
    next();
});

router.get('/', async (req, res, next) => {
    try {
        const page = pageOf(req.query);
        const {items, total} =  await persons.persons(page.limit, page.offset);

        res.json(paged(req, page, total, toPersonsDto(items)));

    } catch (error) {
        next(error);
    }
});


// GET /api/persons/{nconst}: One person with name rating, professions and known-for titles
router.get('/:ncosnt', async (req, res, next) => {
    try {
        const nconst: string = res.locals.ncosnt;
        const foundPerson: persons.Person[] | undefined = await persons.getOnePerson(nconst);

        // not sure if this is an error
        // but it should be as its look up by specific nconst
        if (foundPerson === undefined) throw new error.NotFound('Person not found');

        res.json(toPersonsDto(foundPerson));
    } catch (error) {
        next(error);  
    }
});
