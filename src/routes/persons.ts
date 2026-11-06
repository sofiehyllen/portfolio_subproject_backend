import { Router } from 'express';
import * as persons from '../data/persons.js';
import * as error from '../middleware/errors.js';
import { pageOf, paged} from '../routes/pagination.js'
import { toPersonsDto, toOnePersonDto, toOnePersonTitleDto } from './dto.js';

export const router = Router();

/**
 * Validates an IMDb-style person ID (e.g. "nm0000042").
 * @param value 
 * @returns The ID if it matches the format, or `undefined`
 */
function parseNconst(value: string): string | undefined {
  return /^nm\d{7,}$/.test(value) ? value : undefined;
}

// validates the :nconst route param and stores the value in res.locals
router.param('nconst', (_req, res, next, value: string) => {
    const nconst = parseNconst(value);
    if (nconst === undefined) {
        return next(new error.BadRequest('nconst must be a string starting with nm and have at least 7 digits'));
    }
    res.locals.nconst = nconst;
    next();
});

// GET api/persons/: Paged list of persons, optionally filtered by name and actorsOnly
// 400 invalid search parameter; 401 invalid token
router.get('/', async (req, res, next) => {
    try {
        const page = pageOf(req.query);
        const {items, total} =  await persons.getPersons(page.limit, page.offset);

        res.json(paged(req, page, total, items.map(toPersonsDto)));

    } catch (error) {
        next(error);
    }
});


// GET /api/persons/{nconst}: One person with name rating, professions and known-for titles
router.get('/:nconst', async (_req, res, next) => {
    try {
        const nconst: string = res.locals.nconst;
        const foundPerson: persons.onePerson | undefined = await persons.getOnePerson(nconst);

        // not sure if this is an error
        // but it should be as its look up by specific nconst
        if (foundPerson === undefined) throw new error.NotFound('Person not found');

        res.json(toOnePersonDto(foundPerson));
    } catch (error) {
        next(error);  
    }
});

// GET /api/persons/{nconst}/titles
// Paged titles the person has been credited on, each with their role (category, job, characters)
router.get('/:nconst/titles', async (req, res, next) => {
    try {
        const nconst: string = res.locals.nconst;
        const person = await persons.getOnePerson(nconst);
        if (person === undefined) throw new error.NotFound('Person not found');

        const page = pageOf(req.query);
        const {items, total} =  await persons.getPersonTitles(nconst, page.limit, page.offset);

        res.json(paged(req, page, total, items.map(toOnePersonTitleDto)));
    } catch (error) {
        next(error);  
    }
});
