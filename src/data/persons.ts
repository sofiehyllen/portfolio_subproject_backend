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

export interface PersonDetails extends Person {
  roles:    string[];
  knownFor:       KnownFor[];
}

// Filter for GET /api/persons: roles keeps only persons with at least one
// credit in title_persons in one of the given categories (e.g. actor, writer).
export interface PersonFilter {
  professions: string[];
}

// Shared by the page query and the count query, so total always matches the filter.
const PERSON_FILTER = `
  WHERE cardinality($1::text[]) = 0
    OR EXISTS (
      SELECT 1
      FROM person_professions pp
      JOIN professions pr ON pr.pconst = pp.pconst
      WHERE pp.nconst = p.nconst
        AND pr.profession_name = ANY($1::text[])
    )`;

/**
 * Gets a paginated list of persons, ordered alphabetically by primary name.
 * @param limit 
 * @param offset 
 * @returns An object with `items` (the requested page of persons) and `total` (the number of persons in the table)
 */
export async function getPersons(filter: PersonFilter, limit: number, offset: number) {
  const { rows: items } = await pool.query<Person>(
    `SELECT p.nconst,
            p.primary_name    AS "primaryName",
            p.birth_year      AS "birthYear",
            p.death_year      AS "deathYear",
            p.avg_name_rating::float8 AS "avgNameRating",
            array (
              select pr.profession_name
              from person_professions pp
              join professions pr on pr.pconst = pp.pconst
              where pp.nconst = p.nconst
              order by pr.profession_name
            ) as professions
    FROM persons p
    ${PERSON_FILTER}
    ORDER BY p.primary_name, p.nconst
    LIMIT $2
    OFFSET $3`,
    [filter.professions, limit, offset]
  );


  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS total
    FROM persons p
    ${PERSON_FILTER}`,
    [filter.professions]
  );

  return { items, total: countRows[0].total};
}

/**
 * Gets a single person by their unique identifier
 * @param nconst 
 * @returns The matching person (undefined if none found)
 */
export async function getPersonDetails(nconst: string): Promise<PersonDetails | undefined> {
  const result  = await pool.query<PersonDetails>(`
    select 
      p.nconst,
      p.primary_name as "primaryName",
      p.birth_year as "birthYear",
      p.death_year as "deathYear",
      p.avg_name_rating::float8 as "avgNameRating",
      array (
        select pr.profession_name
        from person_professions pp
        join professions pr on pr.pconst = pp.pconst
        where pp.nconst = p.nconst
        order by pr.profession_name
      ) as professions,
      array (
        select distinct tp.category
        from title_persons tp
        where tp.nconst = p.nconst
        order by tp.category
      ) as roles,
      COALESCE(
        (SELECT json_agg(
                    json_build_object('tconst', t.tconst, 'primaryTitle', t.primary_title)
                    order by t.primary_title, t.tconst
                )
        FROM person_known_for pkf
        JOIN titles t USING (tconst)
        WHERE pkf.nconst = p.nconst),
        '[]') AS "knownFor"
    from persons as p
    WHERE p.nconst = $1`,
    [nconst]);

    return result.rows[0]; 
}
