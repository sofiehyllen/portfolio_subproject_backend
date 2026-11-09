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
  rating: { average: number; votes: number } | null; // null when the title has no votes
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
          plot,
          (SELECT json_build_object('average', r.average_rating::float8,
                                    'votes', r.num_votes)
           FROM ratings r WHERE r.tconst = titles.tconst) AS rating
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
     FROM (${SELECT} WHERE tconst = $1) AS t`,
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
