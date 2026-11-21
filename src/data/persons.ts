/**
 * Data-access layer for the `persons` table.
 *
 * Types:
 * - `Person` — a person row with name, birth/death year, name rating and professions.
 * - `KnownFor` — a compact title (tconst and primaryTitle) used in `PersonDetail`.
 * - `PersonDetail` — extends `Person` with `roles` (credit categories) and `knownFor` titles.
 * - `PersonTitle` — one title credit for a person: tconst, title, category, job and characters.
 * - `CoPlayer` — a person who has shared screen credit with another, with a co-occurrence frequency.
 * - `PersonWord` — a word strongly associated with a person's titles, with a frequency count.
 * - `PersonFilter` — optional name search and actorsOnly flag for `getPersons`.
 * - `PersonBrowse` — extends `PersonFilter` with sort field and direction.
 * - `PERSON_SORT_FIELDS` / `PersonSortField` — the allowed sort fields: name, rating.
 *
 * Query functions:
 * - `list(logAs, browse, limit, offset)` — paged slice of persons matching the filter,
 *   sorted by the chosen field and direction, plus the total number of matches. A name
 *   search is logged by name_search/actor_search under `logAs`, or not at all if null.
 * - `get(nconst)` — one person with roles and known-for titles,
 *   or undefined when no such person exists.
 * - `exists(nconst)` — true when a person with this nconst exists.
 * - `listTitles(nconst, limit, offset)` — paged title credits for the person, newest first.
 * - `listCoPlayers(nconst, limit, offset)` — paged co-players ranked by frequency, plus the total;
 *   undefined when no such person exists.
 * - `listWords(nconst, limit, offset)` — paged word associations ranked by frequency, plus
 *   the total; undefined when no such person exists.
 */
import { pool } from '../db.js';
import { orderBy, Sort } from './sorting.js';

/**
 * A person as listed
 * @property nconst         - ID of the person
 * @property primaryName    - the person's name
 * @property birthYear      - year of birth (`null` when unknown)
 * @property deathYear      - year of death (`null` when unknown)
 * @property avgNameRating  - average name rating or `null` when there is none
 * @property professions    - profession names
 * @property
 */
export interface Person {
  nconst:         string;
  primaryName:    string;
  birthYear:      number | null;
  deathYear:      number | null;
  avgNameRating:  number | null;
  professions:    string[];
}

/**
 * A title a person is known for
 * @property  tconst        - ID of the title
 * @property  primaryTitle  - name of the title
 */
export interface KnownFor {
  tconst:       string;
  primaryTitle: string;
}

/**
 * One person in full: the list fields plus roles and known-for titles
 * @property roles      - distinct credit categories
 * @property knownFor   - titles the person is known for, ordered by name
 */
export interface PersonDetail extends Person {
  roles:    string[];
  knownFor: KnownFor[];
}

/**
 * One title credit of a person
 * @property tconst         - ID of the title
 * @property nconst         - ID of the person
 * @property primaryTitle   - name of the title
 * @property category       - credit category
 * @property job            - job description
 * @property characters     - characters played in this credit
 */
export interface PersonTitle {
  tconst:       string;
  nconst:       string;
  primaryTitle: string;
  category:     string;
  job:          string | null;
  characters:   string[];
}

/**
 * A person who shares titles with another person
 * @property nconst         - ID of the co-player
 * @property primaryName    - the co-player's name
 * @property frequency      - how often the two appear together, from `co_players()`
 */
export interface CoPlayer {
  nconst:         string;
  primaryName:    string;
  frequency:      number;
}

/**
 * A word associated with a person's titles
 * @property word       - the word
 * @property frequency  - how often the word occurs, from `person_words()`
 */
export interface PersonWord {
  word:       string;
  frequency:  number;
}

/**
 * Filter for GET /api/persons. Without a name every person is listed; with a
 * name the list is narrowed by name_search, or by actor_search when actorsOnly
 * is set. 
 * 
 * @property name       - name to search for
 * @property actorsOnly - only match actors. Only allowed together with `name` 
 */
export interface PersonFilter {
  name?:      string;
  actorsOnly: boolean;
}

/** The fields `GET /api/persons` can be sorted by. Also used at runtime for validation. */
export const PERSON_SORT_FIELDS = ['name', 'rating'] as const;
/** A person sort field: `'name'` or `'rating'`. */
export type PersonSortField = typeof PERSON_SORT_FIELDS[number];

/** The column behind each sort field. Only these strings ever reach ORDER BY. */
const PERSON_SORT_COLUMN: Record<PersonSortField, string> = {
  name:   'p.primary_name',
  rating: 'p.avg_name_rating',
};

// GET /api/persons: the filter and the chosen sort.
export interface PersonBrowse extends PersonFilter, Sort<PersonSortField> {}

/** The columns of a {@link Person}, shared by `list` and `get`. */
const PERSON_COLUMNS = `
  p.nconst,
  p.primary_name            AS "primaryName",
  p.birth_year              AS "birthYear",
  p.death_year              AS "deathYear",
  p.avg_name_rating::float8 AS "avgNameRating",
  ARRAY(SELECT pr.profession_name
        FROM person_professions pp
        JOIN professions pr ON pr.pconst = pp.pconst
        WHERE pp.nconst = p.nconst
        ORDER BY pr.profession_name) AS professions`;


/**
 * The FROM clause shared by the page query and the count query, so total always
 * matches the filter. With a name, name_search or actor_search (when actorsOnly
 * is set) decides which persons match; without a name every person is included.
 * @param filter      - the person filter
 * @param logAs       - user to log the search under or `null` to skip logging
 * @returns             the from clause and its params
 */
// The search function logs the search under logAs, or skips logging if null.
function personSource(filter: PersonFilter, logAs: number | null): { from: string; params: (string | number | null)[] } {
  if (filter.name === undefined) {
    return { from: 'persons p', params: [] };
  }
  const search = filter.actorsOnly ? 'actor_search' : 'name_search';
  return {
    from: `${search}($1, $2) s JOIN persons p ON p.nconst = s.nconst`,
    params: [logAs, filter.name],
  };
}


/**
 * Gets a page of persons matching the filter, sorted by the chosen field and
 * direction, plus the total number of matches. The two queries run in parallel.
 *
 * Both queries call the search function, and each call logs, so only the page
 * query passes `logAs`; the count query passes `null`. A search is logged at 
 * most once per request.
 *
 * @param logAs  - User to log a name search under, or `null` to skip logging.
 * @param browse - The validated filter and sort.
 * @param limit  - Maximum number of persons to return.
 * @param offset - Number of persons to skip.
 * @returns The persons on this page and the total count.
 */
export async function list(logAs: number | null, browse: PersonBrowse, limit: number, offset: number):
Promise<{ items: Person[]; total: number }> {
  const pageSource  = personSource(browse, logAs);
  const countSource = personSource(browse, null);
  const n = pageSource.params.length; // limit and offset come after the filter parameters
 
  // The two queries are independent, so they run in parallel.
  const [page, count] = await Promise.all([
    pool.query<Person>(
      `SELECT ${PERSON_COLUMNS}
        FROM ${pageSource.from}
        ${orderBy(PERSON_SORT_COLUMN[browse.sort], browse.order, 'p.primary_name, p.nconst')}
        LIMIT $${n + 1} OFFSET $${n + 2}`, //the parameter number is adjusted with n
      [...pageSource.params, limit, offset]),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total
        FROM ${countSource.from}`,
      countSource.params),
  ]);

  return { items: page.rows, total: count.rows[0].total };
}


/**
 * Gets one person with roles and known-for titles
 * @param nconst        - ID of the person
 * @returns               the person or `undefined` when no such person exists
 */
export async function get(nconst: string): Promise<PersonDetail | undefined> {
  const { rows } = await pool.query<PersonDetail>(
    `SELECT ${PERSON_COLUMNS},
      ARRAY(SELECT DISTINCT tp.category
            FROM title_persons tp
            WHERE tp.nconst = p.nconst
            ORDER BY tp.category) AS roles,
      COALESCE(
        (SELECT json_agg(
          json_build_object('tconst', t.tconst,
                            'primaryTitle', t.primary_title)
                            ORDER BY t.primary_title, t.tconst)
        FROM person_known_for pkf
        JOIN titles t ON t.tconst = pkf.tconst
        WHERE pkf.nconst = p.nconst),
        '[]') AS "knownFor"
      FROM persons p
      WHERE p.nconst = $1`,
    [nconst]);
  return rows[0];
}


/**
 * Checks whether a peson exists
 * @param nconst          - ID of the person
 * @returns                 `true` whne a person with this `nconst` exists
 */
export async function exists(nconst: string): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM persons WHERE nconst = $1`,[nconst]);
    return (rowCount ?? 0) > 0;
}

/**
 * Looks up a person's primary name. Needed because `co_players()` and `person_words()`
 * take a name,  not a `nconst`
 * @param nconst        - ID of the person
 * @returns               the name or `undefined` when no such person exists
 */
async function nameOf(nconst: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ primaryName: string }>(
    'SELECT primary_name AS "primaryName" FROM persons WHERE nconst = $1',
    [nconst]);
  return rows[0]?.primaryName;
}

/**
 * Gets a page of the person's title credits, newest title first, plus the total number of credits
 * 
 * @param nconst          - ID of the person 
 * @param limit           - maximum number of credits to return
 * @param offset          - number of credits to skip
 * @returns                 the credits on this page and total count
 */
export async function listTitles(nconst: string, limit: number, offset: number): Promise<{ items: PersonTitle[]; total: number}> {
  // The page and the count are independent, so they run in parallel.
  const [page, count] = await Promise.all([
    pool.query<PersonTitle>(`
      SELECT  t.tconst,
              tp.nconst,
              t.primary_title as "primaryTitle",
              tp.category,
              tp.job,
              ARRAY(SELECT c.character_name
                    FROM title_person_characters c
                    WHERE c.tconst = tp.tconst and c.ordering = tp.ordering
                    ORDER BY c.character_name) as characters
      FROM title_persons tp
      JOIN titles t ON t.tconst = tp.tconst
      WHERE tp.nconst = $1
      ORDER BY t.start_year DESC NULLS LAST, t.tconst, tp.ordering
      LIMIT $2
      OFFSET $3`,
      [nconst, limit, offset]),
    pool.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM title_persons WHERE nconst = $1',
      [nconst]),
  ]);

  return { items: page.rows, total: count.rows[0].total };
}


/**
 * Gets a page of the person's co-player with `co_players()`, most frequent first plus the total number of cp-players
 * @param nconst      - ID of the person
 * @param limit       - maximum number of co-players to return
 * @param offset      - number of co-players to skip
 * @returns             the co-playes on this page and the total or `undefined` when no such person exists
 */
export async function listCoPlayers(nconst: string, limit: number, offset: number): Promise<{ items: CoPlayer[], total: number} | undefined> {
  const name = await nameOf(nconst); // the queries below need the name, so this runs first
  if (name === undefined) return undefined;

  // The page and the count are independent, so they run in parallel.
  const [page, count] = await Promise.all([
    pool.query<CoPlayer>(
      `SELECT nconst,
              primary_name AS "primaryName",
              frequency::int AS frequency
       FROM co_players($1)
       ORDER BY frequency DESC, primary_name, nconst
       LIMIT $2 OFFSET $3`,
      [name, limit, offset]),
    pool.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM co_players($1)',
      [name]),
  ]);
  return { items: page.rows, total: count.rows[0].total };
}


/** Secons argument of `person_words()`; how many words to ask for */
const PERSON_WORDS_LEN = 10;

/**
 * Gets a page of the words most associated with the person's title with `person_words()`, most frequent first plus the total 
 * The function is asked for {@link PERSON_WORDS_LEN} words
 * @param nconst      - ID of the person
 * @param limit       - maximum number of words to return
 * @param offset      - number of words to skip
 * @returns           the words on this page and the total or `undefined` when no such person exists
 */
export async function listWords(nconst: string, limit: number, offset: number): Promise<{ items: PersonWord[]; total: number} | undefined> {
  const name = await nameOf(nconst); // the queries below need the name, so this runs first
  if (name === undefined) return undefined;

  const [page, count] = await Promise.all([
    pool.query<PersonWord>(
      `SELECT word, frequency::int AS frequency
       FROM person_words($1, $2)
       ORDER BY frequency DESC, word
       LIMIT $3 OFFSET $4`,
      [name, PERSON_WORDS_LEN, limit, offset]),
    pool.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM person_words($1, $2)',
      [name, PERSON_WORDS_LEN]),
  ]);
  return { items: page.rows, total: count.rows[0].total };
}