import { pool } from '../db.js';

export interface Title {
  tconst: string;
  titleType: string;
  primaryTitle: string;
  originalTitle: string;
  isAdult: boolean;
  startYear: number;
  endYear: number;
  runtimeMinutes: number;
  awards: string;
  posterUrl: string;
  plot: string;
}

const SELECT = `
  SELECT tconst,
          title_type      AS "titleType",
          primary_title   AS "primaryTitle",
          original_title  AS "originalTitle",
          is_adult        AS "isAdult",
          start_year      AS "startYear",
          end_year        AS "endYear",
          runtime_minutes AS "runtimeMinutes",
          awards,
          poster_url      AS "posterUrl",
          plot
  FROM titles`;

/** A page of titles, ordered by title. */
export async function list(limit: number, offset: number): Promise<Title[]> {
  const { rows } = await pool.query<Title>(
    `${SELECT} ORDER BY primary_title, tconst LIMIT $1 OFFSET $2`,
    [limit, offset]);
  return rows;
}

/** How many titles there are in all, for the total in a paged answer. */
export async function count(): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM titles');
  return rows[0].total;
}