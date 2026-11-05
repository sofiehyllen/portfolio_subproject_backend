/**
 * Data-access layer for the `titles` table.
 *
 * Exports two interfaces and three query functions:
 * - `Title` — full row shape returned by `list`.
 * - `TitleSummary` — compact shape (tconst, primaryTitle, startYear) returned by `searchText`.
 * - `list(limit, offset)` — paged slice of all titles, ordered alphabetically by primary title.
 * - `count()` — total number of titles, used to build paging metadata for `list`.
 * - `searchText(logAs, text, limit, offset)` — paged substring search via `string_search`;
 *   logs the search under `logAs` (a user id) on the first page, or skips logging if null.
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

// The fields shown for a title in a search result.
export interface TitleSummary {
  tconst: string;
  primaryTitle: string;
  startYear: number | null;
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

// A page of titles matching a substring search, and the total number of matches.
// string_search is called once per request, so the search is logged at most once.
export async function searchText(
  logAs: number | null, text: string, limit: number, offset: number,
): Promise<{ items: TitleSummary[]; total: number }> {
  const { rows } = await pool.query<TitleSummary & { total: number }>(
    `SELECT t.tconst,
            t.primary_title AS "primaryTitle",
            t.start_year    AS "startYear",
            count(*) OVER()::int AS total
      FROM string_search($1, $2) s
      JOIN titles t ON t.tconst = s.tconst
      ORDER BY t.tconst
      LIMIT $3 OFFSET $4`,
    [logAs, text, limit, offset]);
  const total = rows.length > 0 ? rows[0].total : 0;
  return { items: rows.map(({ total: _, ...title }) => title), total };
}