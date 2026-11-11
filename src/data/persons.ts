/**
 * Data-access layer for the `persons` table.
 *
 * Query functions:
 * - `getPersons(filter, limit, offset)` — paged slice of persons matching the filter,
 *   ordered alphabetically by primary name, plus the total number of matches.
 * - `getPersonDetail(nconst)` — one person with roles and known-for titles,
 *   or undefined when no such person exists.
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


// The FROM clause of the page query and the count query, so total always
// matches the filter. With a name, the database function decides which persons
// match, and $1 is the name. The function name is chosen from a boolean.
function personSource(filter: PersonFilter): { from: string; params: string[] } {
  if (filter.name === undefined) {
    return { from: 'persons p', params: [] };
  }
  const search = filter.actorsOnly ? 'actor_search' : 'name_search';
  return {
    from: `${search}($1) s JOIN persons p ON p.nconst = s.nconst`,
    params: [filter.name],
  };
}


// A page of persons, ordered alphabetically by primary name, plus the total number of matching persons.
// name_search and actor_search do not log, so the functions can be called twice.
export async function getPersons(browse: PersonBrowse, limit: number, offset: number): 
Promise<{ items: Person[]; total: number }> {
  const { from, params } = personSource(browse);
  const n = params.length; // limit and offset come after the filter parameters

  // The two queries are independent, so they run in parallel.
  const [page, count] = await Promise.all([
    pool.query<Person>(
      `SELECT ${PERSON_COLUMNS}
        FROM ${from}
        ${orderBy(PERSON_SORT_COLUMN[browse.sort], browse.order, 'p.primary_name, p.nconst')}
        LIMIT $${n + 1} OFFSET $${n + 2}`, //the parameter number is adjusted with n
      [...params, limit, offset]),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total
        FROM ${from}`,
      params),
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