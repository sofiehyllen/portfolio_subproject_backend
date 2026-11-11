import { pool } from '../db.js';

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

// Filter for GET /api/persons
export interface PersonFilter {
  professions: string[];
}


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


// Shared by the page query and the count query, so total always matches the filter.
// $1 is the list of professions; an empty list matches every person.
const PERSON_FILTER = `
  WHERE cardinality($1::text[]) = 0
    OR EXISTS (
      SELECT 1
      FROM person_professions pp
      JOIN professions pr ON pr.pconst = pp.pconst
      WHERE pp.nconst = p.nconst
        AND pr.profession_name = ANY($1::text[])
    )`;


// A page of persons, ordered alphabetically by primary name, plus the total number of matching persons.
export async function getPersons(
  filter: PersonFilter, limit: number, offset: number,
): Promise<{ items: Person[]; total: number }> {
  // The two queries are independent, so they run in parallel.
  const [page, count] = await Promise.all([
    pool.query<Person>(
      `SELECT ${PERSON_COLUMNS}
        FROM persons p
        ${PERSON_FILTER}
        ORDER BY p.primary_name, p.nconst
        LIMIT $2 OFFSET $3`,
      [filter.professions, limit, offset]),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total
        FROM persons p
        ${PERSON_FILTER}`,
      [filter.professions]),
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
        JOIN titles t USING (tconst)
        WHERE pkf.nconst = p.nconst),
        '[]') AS "knownFor"
      FROM persons p
      WHERE p.nconst = $1`,
    [nconst]);
  return rows[0];
}