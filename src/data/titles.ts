/**
 * Data-access layer for the `titles` table.
 *
 * Types:
 * - `Title` — a title row as listed.
 * - `TitleSummary` — compact title (tconst, primaryTitle, startYear); returned by search functions.
 * - `Credit` — one credit of a title: person id, name, category, job and characters.
 * - `TitleDetail` — extends `Title` with `genres` and `credits`.
 * - `Actor` — an actor with name and name rating.
 * - `SimilarMovie` — a movie sharing genres, with a similarity score and the common genre names.
 * - `StructuredSearch` — the four fields of a structured search: title, plot, character, person.
 * - `TitleFilter` — optional genre and titleType for `list` and `count`.
 * - `TitleBrowse` — extends `TitleFilter` with sort field and direction.
 * - `TITLE_SORT_FIELDS` / `TitleSortField` — the allowed sort fields: title, year, rating, votes, runtime.
 *
 * Query functions:
 * - `exists(tconst)` — true when a title with this tconst exists.
 * - `list(browse, limit, offset)` — paged slice of titles, filtered and sorted as asked;
 *   titles without a value for the sort field come last.
 * - `count(filter)` — number of titles matching the filter, used for the total of `list`.
 * - `get(tconst)` — one title with genres, rating and credits, or undefined if not found.
 * - `actors(tconst, limit, offset)` — paged actors of the title, highest name rating first;
 *   undefined if the title does not exist.
 * - `similar(tconst, limit, offset)` — paged movies sharing genres with the title, most shared
 *   first; undefined if the title does not exist.
 * - `searchText(logAs, text, limit, offset)` — paged substring search via `string_search`,
 *   ordered by tconst, with the total number of matches. Logs the search under `logAs`
 *   (a user id), or skips logging if null.
 * - `searchKeywords(logAs, keywords, match, limit, offset)` — paged keyword search via
 *   `exact_match_search` (all), `best_match_querying` (any) or `weighted_search` (weighted),
 *   ranked by the function's score, then tconst. Logs like `searchText`.
 * - `searchStructured(logAs, search, limit, offset)` — paged search via `structured_string_search`
 *   across title, plot, character and person fields; empty fields are ignored. Same logging
 *   behaviour as `searchText`.
 */
import { pool } from '../db.js';
import { orderBy, Sort } from './sorting.js';


// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A title as listed.
 * @property tconst         - Id of the title.
 * @property titleType      - Type, e.g. `movie` or `tvSeries`.
 * @property primaryTitle   - The title's main name.
 * @property originalTitle  - Name in the original language, or `null`.
 * @property isAdult        - Whether the title is adult content.
 * @property startYear      - Release year (first year for a series), or `null`.
 * @property endYear        - Last year of a series, or `null`.
 * @property runtimeMinutes - Runtime in minutes, or `null`.
 * @property awards         - Awards text, or `null`.
 * @property posterUrl      - Poster image URL, or `null`.
 * @property plot           - Plot summary, or `null`.
 * @property rating         - Average rating and number of votes, or `null` when the title has no votes.
 */
export interface Title {
  tconst:           string;
  titleType:        string;
  primaryTitle:     string;
  originalTitle:    string | null;
  isAdult:          boolean;
  startYear:        number | null;
  endYear:          number | null;
  runtimeMinutes:   number | null;
  awards:           string | null;
  posterUrl:        string | null;
  plot:             string | null;
  rating:           { average: number; votes: number } | null;
}

/**
 * The fields shown for a title in a search result.
 * @property tconst         - ID of the title.
 * @property primaryTitle   - the title's main name.
 * @property startYear      - release year or `null`.
 */
export interface TitleSummary {
  tconst:         string;
  primaryTitle:   string;
  startYear:      number | null;
}

/**
 * One credit of a title.
 * @property nconst     - Id of the credited person.
 * @property name       - The person's name.
 * @property category   - Credit category, e.g. `actor` or `director`.
 * @property job        - Job description, or `null`.
 * @property characters - Characters played, alphabetical; empty when none.
 */
export interface Credit {
  nconst:     string;
  name:       string;
  category:   string;
  job:        string | null;
  characters: string[];
}

/**
 * One title in full: the list fields plus genres and credits.
 * @property genres  - Genre names, alphabetical.
 * @property credits - Credits in IMDb's billing order.
 */
export interface TitleDetail extends Title {
  genres:  string[];
  credits: Credit[];
}

/**
 * An actor of a title.
 * @property nconst     - Id of the actor.
 * @property name       - The actor's name.
 * @property nameRating - The actor's name rating, or `null`.
 */
export interface Actor {
  nconst:       string;
  name:         string;
  nameRating:   number | null;
}

/**
 * A movie that shares genres with another title.
 * @property tconst          - Id of the movie.
 * @property primaryTitle    - Name of the movie.
 * @property similarityScore - Score from `similar_movies()`; higher means more shared genres.
 * @property commonGenres    - The shared genre names.
 */
export interface SimilarMovie {
  tconst:           string;
  primaryTitle:     string;
  similarityScore:  number;
  commonGenres:     string[];
}

/**
 * The fields of a structured search.
 * @property title      - text to match in the title.
 * @property plot       - text to match in the plot.
 * @property character  - text to match character names.
 * @property person     - text to match in credited person names.
 */
export interface StructuredSearch {
  title:        string;
  plot:         string;
  character:    string;
  person:       string;
}


// ── Browse / filter ──────────────────────────────────────────────────────────

/**
 * Filter for browsing titles. Both fields match case-insensitively.
 * @property genre     - Only titles with this genre.
 * @property titleType - Only titles of this type.
 */
export interface TitleFilter {
  genre?:     string;
  titleType?: string;
}

/** The fields `GET /api/titles` can be sorted by. Also used at runtime for validation. */
export const TITLE_SORT_FIELDS = ['title', 'year', 'rating', 'votes', 'runtime'] as const;
/** A title sort field: `'title'`, `'year'`, `'rating'`, `'votes'` or `'runtime'`. */
export type TitleSortField = typeof TITLE_SORT_FIELDS[number];

/** The column behind each sort field. Only these strings ever reach ORDER BY. */
const TITLE_SORT_COLUMN: Record<TitleSortField, string> = {
  title:   't.primary_title',
  year:    't.start_year',
  rating:  'r.average_rating',
  votes:   'r.num_votes',
  runtime: 't.runtime_minutes',
};

/** Query of `GET /api/titles` without a search: the filter plus the chosen sort. */
export interface TitleBrowse extends TitleFilter, Sort<TitleSortField> {}


// ── Shared SQL ───────────────────────────────────────────────────────────────

/** Shared SELECT for {@link Title} rows. Titles are aliased `t` and ratings `r`, so callers can filter and sort on either. */
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

/**
 * Builds the WHERE clause for a filter, numbering its parameters after the ones already used.
 *
 * @param filter     - The title filter.
 * @param firstParam - Number of the first placeholder to use; `3` makes the first one `$3`.
 * @returns            The clause (empty when there is no filter) and its parameters, in order.
 */
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


// ── Query functions ──────────────────────────────────────────────────────────

/**
 * Checks whether a title exists.
 * @param tconst      - ID of the title.
 * @returns             `true` when a title with this `tconst` exists.
 */
export async function exists(tconst: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM titles WHERE tconst = $1', [tconst]);
  return (rowCount ?? 0) > 0;
}

/**
 * Gets a page of titles, filtered and sorted as asked. Titles without a value
 * for the sort field come last in both directions; tconst settles ties, so
 * paging stays stable.
 *
 * @param browse - The validated filter and sort.
 * @param limit  - Maximum number of titles to return.
 * @param offset - Number of titles to skip.
 * @returns The titles on this page.
 */
export async function list(browse: TitleBrowse, limit: number, offset: number): Promise<Title[]> {
  const where = whereOf(browse, 3);
  const { rows } = await pool.query<Title>(
    `${SELECT} ${where.sql}
     ${orderBy(TITLE_SORT_COLUMN[browse.sort], browse.order, 't.tconst')}
     LIMIT $1 OFFSET $2`,
    [limit, offset, ...where.params]);
  return rows;
}

/**
 * Counts the titles matching the filter (the total for {@link list}).
 *
 * @param filter - The title filter (defaults to no filter).
 * @returns        The number of matching titles.
 */
export async function count(filter: TitleFilter = {}): Promise<number> {
  const where = whereOf(filter, 1);
  const { rows } = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM titles t ${where.sql}`,
    where.params);
  return rows[0].total;
}

/**
 * Gets one title with its genres, rating and credits.
 *
 * @param tconst - ID of the title.
 * @returns        The title, or `undefined` when no such title exists.
 */
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

/**
 * Gets a page of the title's actors with `popular_actors()`, highest name
 * rating first, plus the total. Checks that the title exists, because
 * `popular_actors()` alone gives an empty list both for an unknown title and
 * for a title without actors.
 *
 * @param tconst - Id of the title.
 * @param limit  - Maximum number of actors to return.
 * @param offset - Number of actors to skip.
 * @returns The actors on this page and the total, or `undefined` when no such title exists.
 */
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

/**
 * Gets a page of movies sharing genres with the title, with `similar_movies()`,
 * most shared genres first, plus the total. Checks that the title exists,
 * because `similar_movies()` alone gives an empty list both for an unknown
 * title and for a title that is not a movie.
 *
 * @param tconst - Id of the title.
 * @param limit  - Maximum number of movies to return.
 * @param offset - Number of movies to skip.
 * @returns The movies on this page and the total, or `undefined` when no such title exists.
 */
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

/**
 * Substring search over titles with `string_search()`, ordered by tconst,
 * plus the total number of matches. The function is called once per request,
 * so a search is logged at most once.
 *
 * @param logAs  - User to log the search under, or `null` to skip logging.
 * @param text   - The validated search text.
 * @param limit  - Maximum number of titles to return.
 * @param offset - Number of titles to skip.
 * @returns The matching titles on this page and the total count.
 */
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

/** The keyword match modes of `GET /api/titles?keywords=...`. Also used at runtime for validation. */
export const KEYWORD_MATCHES = ['all', 'any', 'weighted'] as const;
/**
 * How keywords are combined: `all` (every keyword must match), `any` (titles
 * matching the most keywords first) or `weighted` (most keywords, then highest
 * weight, then most votes).
 */
export type KeywordMatch = typeof KEYWORD_MATCHES[number];

/**
 * The database function behind each match mode, and how its rows are ranked.
 * A function's own ORDER BY is lost once its rows are joined and paged, so each
 * rank repeats it (the final tconst is added in the query). Only these strings
 * ever reach the SQL.
 */
const KEYWORD_SEARCH: Record<KeywordMatch, { dbFunction: string; rank: string }> = {
  // every keyword; the function has no rank
  all:      { dbFunction: 'exact_match_search',   rank: '' },
  // most keywords matched first
  any:      { dbFunction: 'best_match_querying',  rank: 's.word_count DESC,' },
  // most keywords matched, then highest summed weight, then most votes
  weighted: {
    dbFunction: 'weighted_search',
    rank: 's.matched_keywords DESC, s.score DESC, r.num_votes DESC NULLS LAST,',
  },
};

/**
 * Keyword search over titles. Keywords are matched against words from each
 * title's name, plot, character names and credited person names (`word_index`).
 * The match mode picks the database function: `exact_match_search` (all),
 * `best_match_querying` (any) or `weighted_search` (weighted). Results are
 * ranked the way that function ranks them, then by tconst. The function is
 * called once per request, so a search is logged at most once.
 *
 * @param logAs    - User to log the search under, or `null` to skip logging.
 * @param keywords - The validated keywords.
 * @param match    - The match mode.
 * @param limit    - Maximum number of titles to return.
 * @param offset   - Number of titles to skip.
 * @returns The matching titles on this page and the total count.
 */
export async function searchKeywords(
  logAs: number | null, keywords: string[], match: KeywordMatch, limit: number, offset: number,
): Promise<{ items: TitleSummary[]; total: number }> {
  const { dbFunction, rank } = KEYWORD_SEARCH[match];
  const { rows } = await pool.query<TitleSummary & { total: number }>(
     `SELECT t.tconst,
            t.primary_title AS "primaryTitle",
            t.start_year    AS "startYear",
            count(*) OVER()::int AS total
      FROM ${dbFunction}($1, VARIADIC $2::text[]) s
      JOIN titles t ON t.tconst = s.tconst
      LEFT JOIN ratings r ON r.tconst = t.tconst
      ORDER BY ${rank} t.tconst
      LIMIT $3 OFFSET $4`,
    [logAs, keywords, limit, offset]);
  const total = rows.length > 0 ? rows[0].total : 0;
  return { items: rows.map(({ total: _, ...title }) => title), total };
}

/**
 * Structured search over titles with `structured_string_search()`, across the
 * title, plot, character and person fields, ordered by tconst, plus the total
 * number of matches. Empty fields are ignored. Logs like {@link searchText}.
 *
 * @param logAs  - User to log the search under, or `null` to skip logging.
 * @param search - The validated search fields.
 * @param limit  - Maximum number of titles to return.
 * @param offset - Number of titles to skip.
 * @returns The matching titles on this page and the total count.
 */
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
