import { pool } from '../db.js';

export interface Person {
  nconst:         string;
  primaryName:    string;
  birthYear:      number | null;
  deathYear:      number | null;
  avgNameRating:  number;
}

export interface KnownFor {
  tconst:       string;
  primaryTitle: string;
}

export interface onePerson {
  nconst:         string;
  primaryName:    string;
  avgNameRating:  number | null;
  professions:    string[];
  knownFor:       KnownFor[];
}

/**
 * Gets a paginated list of persons, ordered alphabetically by primary name.
 * @param limit 
 * @param offset 
 * @returns An object with `items` (the requested page of persons) and `total` (the number of persons in the table)
 */
export async function getPersons(limit: number, offset: number) {
  const { rows: items } = await pool.query<Person>(
    `SELECT nconst,
            primary_name    AS "primaryName",
            birth_year      AS "birthYear",
            death_year      AS "deathYear",
            avg_name_rating AS "avgNameRating"
    FROM persons
    ORDER BY primary_name, nconst
    LIMIT $1 
    OFFSET $2`,
    [limit, offset]
  );

  const { rows: countRows } = await pool.query(`
    SELECT count(*)::int as total
    FROM persons`);

  return { items, total: countRows[0].total};
}

/**
 * Gets a single person by their unique identifier
 * @param nconst 
 * @returns The matching person (undefined if none found)
 */
export async function getOnePerson(nconst: string): Promise<onePerson | undefined> {
  const result  = await pool.query<onePerson>(`
    select 
      p.nconst,
      p.primary_name as "primaryName", 
      p.avg_name_rating as "avgNameRating", 
      array (
        select pr.profession_name
        from person_professions pp
        join professions pr on pr.pconst = pp.pconst
        where pp.nconst = p.nconst
        order by pr.profession_name
      ) as professions, 
      COALESCE(
        (SELECT json_agg(json_build_object('tconst', t.tconst, 'primaryTitle', t.primary_title))
        FROM person_known_for pkf
        JOIN titles t USING (tconst)
        WHERE pkf.nconst = p.nconst),
        '[]') AS "knownFor"
    from persons as p
    WHERE p.nconst = $1`,
    [nconst]);

    return result.rows[0]; 
}