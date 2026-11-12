/**
 * Data-access layer for the `titles` table.
 *
 * Query functions:
 * - `list(browse, limit, offset)` — paged slice of titles, filtered by genre and title type
 *   and sorted by the chosen field (`SORT_FIELDS`: title, year, rating, votes or runtime)
 *   and direction; titles without a value for the sort field come last.
 * - `count(filter)` — number of titles matching the filter, used for the total of `list`.
 * - `get(tconst)` — one title with genres, rating and credits, or undefined if not found.
 * - `actors(tconst, limit, offset)` — paged actors of the title, highest name rating first;
 *   undefined if the title does not exist.
 * - `similar(tconst, limit, offset)` — paged movies sharing genres with the title, most shared
 *   first; undefined if the title does not exist.
 * - `searchText(logAs, text, limit, offset)` — paged substring search via `string_search`,
 *   ordered by tconst, with the total number of matches. Logs the search under `logAs`
 *   (a user id), or skips logging if null; the route passes null after the first page.
 * - `searchStructured(logAs, search, limit, offset)` — paged search via `structured_string_search`
 *   across title, plot, character and person fields; empty fields are ignored. Same logging
 *   behaviour as `searchText`.
 *
 * Types: `Title` (row shape of `list`, extended by `TitleDetail` with genres and `Credit`s),
 * `TitleSummary` (tconst, primaryTitle, startYear; returned by `searchText`), `Actor`,
 * `SimilarMovie`, and `TitleFilter` / `TitleBrowse` / `SortField` / `SortOrder` for `list`.
 */
import { pool } from '../db.js';
import type { StructuredSearch } from "../validation.js";

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
  rating: { average: number; votes: number } | null; // null when the title has no votes
}

// The fields shown for a title in a search result.
export interface TitleSummary {
  tconst: string;
  primaryTitle: string;
  startYear: number | null;
}

// Titles are aliased t and their ratings r, so callers can filter and sort on either.
const SELECT = `
  SELECT t.tconst,
          t.title_type      AS "titleType",
          t.primary_title   AS "primaryTitle",
          t.original_title  AS "originalTitle",
          t.is_adult        AS "isAdult",
          t.start_year      AS "startYear",
          t.end_year        AS "endYear",
          t.runtime_minutes AS "runtimeMinutes",
          t.awards,
          t.poster_url      AS "posterUrl",
          t.plot,
          CASE WHEN r.tconst IS NULL THEN NULL
               ELSE json_build_object('average', r.average_rating::float8,
                                      'votes', r.num_votes)
          END AS rating
  FROM titles t
  LEFT JOIN ratings r ON r.tconst = t.tconst`;

export const SORT_FIELDS = ['title', 'year', 'rating', 'votes', 'runtime'] as const;
export type SortField = typeof SORT_FIELDS[number];
export type SortOrder = 'asc' | 'desc';

// The column behind each sort field. Only these strings ever reach ORDER BY.
const SORT_COLUMN: Record<SortField, string> = {
  title: 't.primary_title',
  year: 't.start_year',
  rating: 'r.average_rating',
  votes: 'r.num_votes',
  runtime: 't.runtime_minutes',
};

export interface TitleFilter {
  genre?: string;
  titleType?: string;
}

export interface TitleBrowse extends TitleFilter {
  sort: SortField;
  order: SortOrder;
}

// The WHERE clause for a filter, numbering its parameters after the ones already used.
function whereOf(filter: TitleFilter, firstParam: number): { sql: string; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filter.titleType !== undefined) {
    params.push(filter.titleType);
    conditions.push(`lower(t.title_type) = lower($${firstParam + params.length - 1})`);
  }
  if (filter.genre !== undefined) {
    params.push(filter.genre);
    conditions.push(`EXISTS (SELECT 1 FROM genre_titles gt JOIN genres g ON g.gconst = gt.gconst
                             WHERE gt.tconst = t.tconst
                               AND lower(g.genre_name) = lower($${firstParam + params.length - 1}))`);
  }
  return { sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

// A page of titles, filtered and sorted as asked. Titles without a value for the
// sort field come last in both directions; tconst settles ties, so paging stays stable.
export async function list(browse: TitleBrowse, limit: number, offset: number): Promise<Title[]> {
  const where = whereOf(browse, 3);
  const direction = browse.order === 'desc' ? 'DESC' : 'ASC';
  const { rows } = await pool.query<Title>(
    `${SELECT} ${where.sql}
     ORDER BY ${SORT_COLUMN[browse.sort]} ${direction} NULLS LAST, t.tconst
     LIMIT $1 OFFSET $2`,
    [limit, offset, ...where.params]);
  return rows;
}

// How many titles match the filter in all, for the total in a paged answer.
export async function count(filter: TitleFilter = {}): Promise<number> {
  const where = whereOf(filter, 1);
  const { rows } = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM titles t ${where.sql}`,
    where.params);
  return rows[0].total;
}

export interface Credit {
  nconst: string;
  name: string;
  category: string;
  job: string | null;
  characters: string[];
}

export interface TitleDetail extends Title {
  genres: string[];
  credits: Credit[];
}

// One title with its genres, rating and credits, or undefined when no such title exists.
export async function get(tconst: string): Promise<TitleDetail | undefined> {
  const { rows } = await pool.query<Title & Pick<TitleDetail, 'genres'>>(
    `SELECT t.*,
            ARRAY(SELECT g.genre_name::text
                  FROM genre_titles gt JOIN genres g ON g.gconst = gt.gconst
                  WHERE gt.tconst = t.tconst
                  ORDER BY g.genre_name) AS genres
     FROM (${SELECT} WHERE t.tconst = $1) AS t`,
    [tconst]);
  const title = rows[0];
  if (!title) return undefined;

  // Credits in IMDb's billing order; a person has several characters in some titles.
  const credits = await pool.query<Credit>(
    `SELECT tp.nconst,
            p.primary_name AS name,
            tp.category,
            tp.job,
            coalesce(array_agg(c.character_name ORDER BY c.character_name)
                     FILTER (WHERE c.character_name IS NOT NULL), '{}') AS characters
     FROM title_persons tp
     JOIN persons p ON p.nconst = tp.nconst
     LEFT JOIN title_person_characters c ON c.tconst = tp.tconst AND c.ordering = tp.ordering
     WHERE tp.tconst = $1
     GROUP BY tp.ordering, tp.nconst, p.primary_name, tp.category, tp.job
     ORDER BY tp.ordering`,
    [tconst]);

  return { ...title, credits: credits.rows };
}

export interface Actor {
  nconst: string;
  name: string;
  nameRating: number | null;
}

// A page of the title's actors, highest name rating first, plus how many there are
// in all. Undefined when no such title exists (popular_actors() alone gives an empty
// list both for an unknown title and for a title without actors).
export async function actors(
  tconst: string, limit: number, offset: number,
): Promise<{ total: number; items: Actor[] } | undefined> {
  const head = await pool.query<{ found: boolean; total: number }>(
    `SELECT EXISTS (SELECT 1 FROM titles WHERE tconst = $1) AS found,
            (SELECT count(*)::int FROM popular_actors($1)) AS total`,
    [tconst]);
  const { found, total } = head.rows[0];
  if (!found) return undefined;

  // Sorted again here: the order of a function's rows is only certain with ORDER BY.
  const { rows } = await pool.query<Actor>(
    `SELECT nconst,
            actor_name          AS name,
            name_rating::float8 AS "nameRating"
     FROM popular_actors($1)
     ORDER BY name_rating DESC NULLS LAST, actor_name, nconst
     LIMIT $2 OFFSET $3`,
    [tconst, limit, offset]);
  return { total, items: rows };
}

export interface SimilarMovie {
  tconst: string;
  primaryTitle: string;
  similarityScore: number;
  commonGenres: string[];
}

// A page of movies sharing genres with the title, most shared genres first, plus how
// many there are in all. Undefined when no such title exists (similar_movies() alone
// gives an empty list both for an unknown title and for a title that is not a movie).
export async function similar(
  tconst: string, limit: number, offset: number,
): Promise<{ total: number; items: SimilarMovie[] } | undefined> {
  const head = await pool.query<{ found: boolean; total: number }>(
    `SELECT EXISTS (SELECT 1 FROM titles WHERE tconst = $1) AS found,
            (SELECT count(*)::int FROM similar_movies($1)) AS total`,
    [tconst]);
  const { found, total } = head.rows[0];
  if (!found) return undefined;

  // Sorted again here: the order of a function's rows is only certain with ORDER BY.
  // tconst settles ties between movies of the same name, so paging stays stable.
  const { rows } = await pool.query<SimilarMovie>(
    `SELECT tconst,
            movie_title                          AS "primaryTitle",
            similarity_score::int                AS "similarityScore",
            string_to_array(common_genres, ', ') AS "commonGenres"
     FROM similar_movies($1)
     ORDER BY similarity_score DESC, movie_title, tconst
     LIMIT $2 OFFSET $3`,
    [tconst, limit, offset]);
  return { total, items: rows };
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

// A page of titles matching a structured search across title, plot, character and person fields,
// plus the total number of matches. Empty fields are ignored by structured_string_search.
export async function searchStructured(
  logAs: number | null, search: StructuredSearch, limit: number, offset: number,
): Promise<{ items: TitleSummary[]; total: number }> {
  const { rows } = await pool.query<TitleSummary & { total: number }>(
    `SELECT t.tconst,
            t.primary_title AS "primaryTitle",
            t.start_year    AS "startYear",
            count(*) OVER()::int AS total
      FROM structured_string_search($1, $2, $3, $4, $5) s
      JOIN titles t ON t.tconst = s.tconst
      ORDER BY t.tconst
      LIMIT $6 OFFSET $7`,
    [logAs, search.title, search.plot, search.character, search.person, limit, offset]);
  const total = rows.length > 0 ? rows[0].total : 0;
  return { items: rows.map(({ total: _, ...title }) => title), total };
}