/**
 * Data-access layer for the `titles` table.
 *
 * Exports the `Title` interface and two query functions:
 * - `list(limit, offset)` — returns a paginated, alphabetically ordered slice of titles.
 * - `count()` — returns the total number of titles, used to build paging metadata.
 */
import { pool } from '../db.js';

export interface Title {
  tconst: string;
  titleType: string;
  primaryTitle: string;
  originalTitle: string | null;
  isAdult: boolean;
  startYear: number | null;
  endYear: number | null;
  runtimeMinutes: number | null;
  awards: string | null;
  posterUrl: string | null;
  plot: string | null;
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

// A page of titles, ordered by title.
export async function list(limit: number, offset: number): Promise<Title[]> {
  const { rows } = await pool.query<Title>(
    `${SELECT} ORDER BY primary_title, tconst LIMIT $1 OFFSET $2`,
    [limit, offset]);
  return rows;
}

// How many titles there are in all, for the total in a paged answer.
export async function count(): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM titles');
  return rows[0].total;
}