import { Router } from 'express';
import * as users from '../data/users.js';
import { NotFound } from '../middleware/errors.js';
import { pageOf, paged } from '../routes/pagination.js';
import { toUserDto, toUserBookmarkTitleDto, toUserBookmarkPersonDto, toBookmarkTitleDto } from './dto.js';
import * as bookmark from '../data/bookmarks.js';

export const router = Router();

// uconst is a SERIAL column, so only positive integers can identify a user.
function parseUconst(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return id <= 2147483647 ? id : undefined; // fits a Postgres integer
}

// Runs before every route in this router whose path contains :uconst, so
// the check is written once. An invalid uconst gets a 400 and the route
// never runs; a valid one is stored in res.locals.uconst as a number.
router.param('uconst', (_req, res, next, value: string) => {
  const uconst = parseUconst(value);
  if (uconst === undefined) {
    res.status(400).json({ error: 'uconst must be a positive integer' });
    return;
  }
  res.locals.uconst = uconst;
  next();
});

/*      Users      */

// GET /api/users/{uconst}: the user's profile (never the password hash).
// TODO: require a token and check it belongs to {uconst} (401/403) once auth exists.
router.get('/:uconst', async (_req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const user = await users.getUser(uconst);
    if (!user) throw new NotFound('User not found');

    res.json(toUserDto(user));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/{uconst}: deletes the user and all their ratings,
// bookmarks and search history. 204 on success, no body.
// TODO: require a token and check it belongs to {uconst} (401/403) once auth exists.
router.delete('/:uconst', async (_req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const deleted = await users.deleteUser(uconst);
    if (!deleted) throw new NotFound('User not found');

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/*      Bookmarks     */

// GET /api/users/{uconst}/bookmarks/titles
// router.get('/:uconst/bookmarks/titles/', async (req, res, next) => {
//   try {
//     const page = pageOf(req.query);
//     const {items, total} = await bookmark.getTitleBookmarks(page.limit, page.offset);
//     const uconst: number = res.locals.uconst;
//     const bookmarkedTitles = await bookmark.getTitleBookmarks(uconst);
//     if (!bookmarkedTitles) {
//       throw new NotFound('Bookmarked titles not found');
//     }
//     res.json(toUserBookmarkTitleDto(bookmarkedTitles[0]));
//   } catch (err) {
//     next(err);
//   }
// });

// GET /api/users/{uconst}/bookmarks/titles - NEW version
router.get('/:uconst/bookmarks/titles/', async (req, res, next) => {
  try {
    const page = pageOf(req.query as Record <string, unknown>);

    const uconst: number = res.locals.uconst;

    const all = await bookmark.listTitleBookmarks(uconst, page.limit, page.offset);
    res.json(all.map(toBookmarkTitleDto));
  } catch (err) {
    next(err);
  }
});

// GET /api/users/{uconst}/bookmarks/titles - OLD version
router.get('/:uconst/bookmarks/titles/', async (req, res, next) => {
  // TO DO: Path returns 'undefined' after '/titles/'. Figure out why and fix it
  try {
    const page = pageOf(req.query as Record <string, unknown>);

    const uconst: number = res.locals.uconst;

    const items = await bookmark.getTitleBookmarks(uconst, page.limit, page.offset);
    const total = await bookmark.count();

    //const {items, total} = await bookmark.getTitleBookmarks(uconst, page.limit, page.offset);
    //const bookmarkedTitles = await bookmark.getTitleBookmarks(uconst);
    if (!items) {
      throw new NotFound('Bookmarked titles not found');
    }
    
    res.json(paged(req, page, total, items.map(toUserBookmarkTitleDto)));
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/{uconst}/bookmarks/titles/{tconst}
router.put('/:uconst/bookmarks/titles/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = req.params.tconst;
    const added = await bookmark.addTitleBookmark(uconst, tconst);

    res.json(toUserBookmarkTitleDto(added));

  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/{uconst}/bookmarks/titles/{tconst}
router.delete('/:uconst/bookmarks/titles/:tconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const tconst = req.params.tconst;
    const deleted = await bookmark.removeTitleBookmark(uconst, tconst);
    if (!deleted) {
      throw new NotFound('Bookmarked title not found');
    }

    res.status(deleted ? 204 : 404).end();

  } catch (err) {
    next(err);
  }
});

// GET /api/users/{uconst}/bookmarks/persons
router.get('/:uconst/bookmarks/persons', async (_req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const bookmarkedPersons = await bookmark.getPersonBookmarks(uconst);
    if (!bookmarkedPersons) {
      throw new NotFound('Bookmarked persons not found');
    }
    res.json(toUserBookmarkPersonDto(bookmarkedPersons[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/{uconst}/bookmarks/persons/{nconst}
router.put('/:uconst/bookmarks/persons/:nconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const nconst = req.params.nconst;
    const added = await bookmark.addPersonBookmark(uconst, nconst);

    res.json(toUserBookmarkPersonDto(added));

  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/{uconst}/bookmarks/persons/{nconst}
router.delete('/:uconst/bookmarks/persons/:nconst', async (req, res, next) => {
  try {
    const uconst: number = res.locals.uconst;
    const nconst = req.params.nconst;
    const deleted = await bookmark.removePersonBookmark(uconst, nconst);
    if (!deleted) {
      throw new NotFound('Bookmarked person not found');
    }

    res.status(deleted ? 204 : 404).end();

  } catch (err) {
    next(err);
  }
});