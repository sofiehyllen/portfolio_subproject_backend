import { pool } from '../db.js';

export interface Person {
  nconst: string;
  primaryName: string;
  birthYear: number;
  deathYear: number;
  avgNameRating: number;
}

export async function persons(): Promise<Person[]> {
  const { rows } = await pool.query<Person>(
    `SELECT nconst,
            primary_name    AS "primaryName",
            birth_year      AS "birthYear",
            death_year      AS "deathYear",
            avg_name_rating AS "avgNameRating"
    FROM persons
    ORDER BY primary_name
    LIMIT 25 OFFSET 100`
  );
  return rows;
}