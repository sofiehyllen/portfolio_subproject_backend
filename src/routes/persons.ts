/**
 * Route handlers for the `/api/persons` collection. Mounted behind
 * `optionalAuth`: a name search by a logged-in user is logged in their search
 * history (first page only).
 *
 * - `GET /`                    — paged list or name search of persons.
 * - `GET /{nconst}`            — one person with roles and known-for titles.
 * - `GET /{nconst}/titles`     — paged title credits of the person.
 * - `GET /{nconst}/co-players` — paged people who share titles with the person.
 * - `GET /{nconst}/words`      — paged words most associated with the person's titles.
 */
import { Router } from 'express';
import * as persons from '../data/persons.js';
import * as error from '../middleware/errors.js';
import { pageOf, paged, searchLogUser} from '../routes/pagination.js'
import { toPersonDto, toPersonDetailDto, toPersonTitleDto, toCoPlayerDto, toPersonWordDto } from './dto.js';
import { validatePersonBrowse, validateNconst } from "../validation.js";

/** Router for `/api/persons`, mounted behind `optionalAuth`. */
export const router = Router();

/**
 * Validates the `:nconst` route parameter and stores it in `res.locals.nconst`.
 *
 * @throws `400 Bad Request` — not `nm` followed by 7–8 digits.
 */
router.param('nconst', (_req, res, next, value: string) => {
    const nconst = validateNconst(value);
    if (nconst === undefined) {
        return next(new error.BadRequest('nconst must be a string starting with nm and have at least 7 digits'));
    }
    res.locals.nconst = nconst;
    next();
});


/**
 * GET /api/persons
 *
 * Paged list of persons. Without `name` every person is listed; with `name`
 * the list is narrowed by a name search, or an actor search with `actorsOnly=true`.
 *
 * @query   `name` (1–100 characters), `actorsOnly` (true/false; requires `name`),
 *          `sort` (name, rating; default name), `order` (asc, desc; default asc),
 *          `limit`, `offset`.
 * @returns `200` with `Paged<PersonDto>`.
 * @throws  `400 Bad Request`  — unknown parameter or invalid value.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 */
router.get('/', async (req, res, next) => {
  try {
    const browse = validatePersonBrowse(req.query);
    const page = pageOf(req.query);

    const logAs = searchLogUser(page, res.locals.auth?.uconst);
    const { items, total } = await persons.list(logAs, browse, page.limit, page.offset);

    res.json(paged(req, page, total, items.map(toPersonDto)));
  } catch (error) {
    next(error);
  }
});


/**
 * GET /api/persons/{nconst}
 *
 * One person with name rating, professions, roles and known-for titles.
 *
 * @returns `200` with a `PersonDetailDto`.
 * @throws  `400 Bad Request`  — invalid `nconst`.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 * @throws  `404 Not Found`    — no such person.
 */
router.get('/:nconst', async (_req, res, next) => {
    try {
        const nconst: string = res.locals.nconst;
        const foundPerson: persons.PersonDetail | undefined = await persons.get(nconst);

        if (foundPerson === undefined) throw new error.NotFound('Person not found');

        res.json(toPersonDetailDto(foundPerson));
    } catch (error) {
        next(error);  
    }
});

/**
 * GET /api/persons/{nconst}/titles
 *
 * Paged titles the person is credited on, newest first, each with the role
 * (category, job, characters). Accepts `limit` and `offset`.
 *
 * @returns `200` with `Paged<PersonTitleDto>`.
 * @throws  `400 Bad Request`  — invalid `nconst`.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 * @throws  `404 Not Found`    — no such person.
 */
router.get('/:nconst/titles', async (req, res, next) => {
    try {
        const nconst: string = res.locals.nconst;
        const person = await persons.exists(nconst);
        if (!person) {
            throw new error.NotFound('Person not found');
        }

        const page = pageOf(req.query);
        const {items, total} =  await persons.listTitles(nconst, page.limit, page.offset);

        res.json(paged(req, page, total, items.map(toPersonTitleDto)));
    } catch (error) {
        next(error);  
    }
});

/**
 * GET /api/persons/{nconst}/co-players
 *
 * Paged people who share titles with the person, most frequent first.
 * Accepts `limit` and `offset`.
 *
 * @returns `200` with `Paged<CoPlayerDto>`.
 * @throws  `400 Bad Request`  — invalid `nconst`.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 * @throws  `404 Not Found`    — no such person.
 */
router.get('/:nconst/co-players', async (req, res, next) => {
    try {
        const page = pageOf(req.query);
        const result = await persons.listCoPlayers(res.locals.nconst, page.limit, page.offset);
        if (!result) throw new error.NotFound('Person not found');

        res.json(paged(req, page, result.total, result.items.map(toCoPlayerDto)));
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/persons/{nconst}/words
 *
 * Paged words most associated with the person's titles, most frequent first.
 * Accepts `limit` and `offset`.
 *
 * @returns `200` with `Paged<PersonWordDto>`.
 * @throws  `400 Bad Request`  — invalid `nconst`.
 * @throws  `401 Unauthorized` — the token cookie is present but invalid or expired.
 * @throws  `404 Not Found`    — no such person.
 */
router.get('/:nconst/words', async (req, res, next) => {
    try {
        const page = pageOf(req.query);
        const result = await persons.listWords(res.locals.nconst, page.limit, page.offset);
        if (!result) throw new error.NotFound('Person not found');

        res.json(paged(req, page, result.total, result.items.map(toPersonWordDto)));
    } catch (err) {
        next(err);
    }
});
