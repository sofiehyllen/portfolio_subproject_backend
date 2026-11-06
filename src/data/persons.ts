import { pool } from '../db.js';

export interface Person {
  nconst: string;
  primaryName: string;
  birthYear: number;
  deathYear: number;
  avgNameRating: number;
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
    ORDER BY primary_name
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
 * @returns An array containing the matching person (empty if none found)
 */
export async function getOnePerson(nconst: string): Promise<Person[] | undefined> {
  const result  = await pool.query<Person>(`
    SELECT  nconst, 
            primary_name    as  "primaryName"
            birth_year      as  "birthYear"
            death_year      as  "deathYear"
            avg_name_rating as  "avgNameRating"
    FROM person 
    WHERE nconst = $1`,
    [nconst]);

    return result.rows; 
}