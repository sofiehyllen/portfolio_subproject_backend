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
 * - `getPersons(logAs, browse, limit, offset)` — paged slice of persons matching the filter,
 *   sorted by the chosen field and direction, plus the total number of matches. A name
 *   search is logged by name_search/actor_search under `logAs`, or not at all if null.
 * - `getPersonDetail(nconst)` — one person with roles and known-for titles,
 *   or undefined when no such person exists.
 * - `checkPersonExists(nconst)` — true when a person with this nconst exists.
 * - `getPersonTitles(nconst, limit, offset)` — paged title credits for the person, newest first.
 * - `getCoPlayers(nconst, limit, offset)` — paged co-players ranked by frequency, plus the total;
 *   undefined when no such person exists.
 * - `getPersonWords(nconst, limit, offset)` — paged word associations ranked by frequency, plus
 *   the total; undefined when no such person exists.
 */
import { pool } from '../db.js';
import { orderBy, Sort } from './sorting.js';

export interface Person {
  nconst:         string;
  primaryName:    string;
  birthYear:      number | null;
  deathYear:      number | null;
  avgNameRating:  number | null;
  professions:    string[];
}

export interface KnownFor {
  tconst:       string;
  primaryTitle: string;
}

export interface PersonDetail extends Person {
  roles:    string[];
  knownFor: KnownFor[];
}

export interface PersonTitle {
  tconst:       string;
  nconst:       string;
  primaryTitle: string;
  category:     string;
  job:          string | null;
  characters:   string[];
}

export interface CoPlayer {
  nconst:         string;
  primaryName:    string;
  frequency:      number;
}

export interface PersonWord {
  word:       string;
  frequency:  number;
}

// Filter for GET /api/persons. Without a name every person is listed; with a
// name the list is narrowed by name_search, or by actor_search when actorsOnly
// is set. actorsOnly is only allowed together with a name (see validation).
export interface PersonFilter {
  name?:      string;
  actorsOnly: boolean;
}

export const PERSON_SORT_FIELDS = ['name', 'rating'] as const;
export type PersonSortField = typeof PERSON_SORT_FIELDS[number];

// The column behind each sort field. Only these strings ever reach ORDER BY.
const PERSON_SORT_COLUMN: Record<PersonSortField, string> = {
  name:   'p.primary_name',
  rating: 'p.avg_name_rating',
};

// GET /api/persons: the filter and the chosen sort.
export interface PersonBrowse extends PersonFilter, Sort<PersonSortField> {}

// Persons are aliased p. The columns of a Person, shared by `getPersons` and `getPersonDetail`.
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


// The FROM clause shared by the page query and the count query, so total always
// matches the filter. With a name, name_search or actor_search (when actorsOnly
// is set) decides which persons match; without a name every person is included.
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


// A page of persons sorted by the chosen field and direction, plus the total number of matches.
// Both queries call the search function, and each call logs. Only the page query passes
// logAs; the count query passes null, so a search is logged at most once per request.
export async function getPersons(logAs: number | null, browse: PersonBrowse, limit: number, offset: number): 
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


// A single person with roles and known-for titles, or undefined when no such person exists.
export async function getPersonDetail(nconst: string): Promise<PersonDetail | undefined> {
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

export async function checkPersonExists(nconst: string): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM persons WHERE nconst = $1`,[nconst]);
    return (rowCount ?? 0) > 0;
}

// The primary name of a person, or undefined when no such person exists.
// co_players() and person_words() take a name, not an nconst.
async function nameOf(nconst: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ primaryName: string }>(
    'SELECT primary_name AS "primaryName" FROM persons WHERE nconst = $1',
    [nconst]);
  return rows[0]?.primaryName;
}

export async function getPersonTitles(nconst: string, limit: number, offset: number): Promise<{ items: PersonTitle[]; total: number}> {
  const { rows: items} = await pool.query<PersonTitle>(`
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
    [nconst, limit, offset]);

  const { rows: countRows } = await pool.query(`
    SELECT count(*)::int as total from title_persons where nconst = $1`,
    [nconst]);
  
  return { items, total: countRows[0].total };
}

export async function getCoPlayers(nconst: string, limit: number, offset: number): Promise<{ items: CoPlayer[], total: number} | undefined> {
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

const PERSON_WORDS_LEN = 10;

export async function getPersonWords(nconst: string, limit: number, offset: number): Promise<{ items: PersonWord[]; total: number} | undefined> {
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