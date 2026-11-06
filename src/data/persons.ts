import { pool } from '../db.js';

export interface Person {
  nconst: string;
  primaryName: string;
  birthYear: number;
  deathYear: number;
  avgNameRating: number;
}

export async function persons(limit: number, offset: number) {
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

export async function getOnePerson(nconst: string): Promise<Person[] | undefined> {
  const result  = await pool.query<Person>(`
    SELECT  nconst, 
            primary_name    as  "primaryName"
            birth_year      as  "birthYear"
            death_year      as  "deathYear"
            avg_name_rating as  "avgNameRating"
    FROM get_person($1)`,
    [nconst]);

    return result.rows; 
}