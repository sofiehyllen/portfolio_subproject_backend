import { Router } from 'express';
import * as persons from '../data/persons.js';
import * as error from '../middleware/errors.js';
import { pageOf, paged, searchLogUser} from '../routes/pagination.js'
import { toPersonDto, toPersonDetailDto } from './dto.js';
import { validatePersonBrowse } from "../validation.js";

export const router = Router();

// nconst is an IMDb-style string (e.g. "nm0000042"): nm followed by at least 7 digits.
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


// GET api/persons/: Paged list of persons
// 400 invalid search parameter; 401 invalid token
router.get('/', async (req, res, next) => {
  try {
    const browse = validatePersonBrowse(req.query);
    const page = pageOf(req.query);

    const logAs = searchLogUser(page, res.locals.uconst as number | undefined);
    const { items, total } = await persons.getPersons(logAs, browse, page.limit, page.offset);

    res.json(paged(req, page, total, items.map(toPersonDto)));
  } catch (error) {
    next(error);
  }
});


// GET /api/persons/{nconst}: One person with name rating, professions and known-for titles
router.get('/:nconst', async (_req, res, next) => {
    try {
        const nconst: string = res.locals.nconst;
        const foundPerson: persons.PersonDetail | undefined = await persons.getPersonDetail(nconst);

        if (foundPerson === undefined) throw new error.NotFound('Person not found');

        res.json(toPersonDetailDto(foundPerson));
    } catch (error) {
        next(error);  
    }
});

