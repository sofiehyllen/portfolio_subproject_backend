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

export interface Credit {
  nconst: string;
  name: string;
  category: string;
  job: string | null;
  characters: string[];
}

export interface TitleDetail extends Title {
  genres: string[];
  rating: { average: number; votes: number } | null;
  credits: Credit[];
}

// One title with its genres, rating and credits, or undefined when no such title exists.
export async function get(tconst: string): Promise<TitleDetail | undefined> {
  const { rows } = await pool.query<Title & Pick<TitleDetail, 'genres' | 'rating'>>(
    `SELECT t.*,
            ARRAY(SELECT g.genre_name::text
                  FROM genre_titles gt JOIN genres g ON g.gconst = gt.gconst
                  WHERE gt.tconst = t.tconst
                  ORDER BY g.genre_name) AS genres,
            (SELECT json_build_object('average', r.average_rating::float8,
                                      'votes', r.num_votes)
             FROM ratings r WHERE r.tconst = t.tconst) AS rating
     FROM (${SELECT} WHERE tconst = $1) AS t`,
    [tconst]);
  const title = rows[0];
  if (!title) return undefined;
  const rating = title.rating; // null when the title has no votes

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

  return { ...title, genres: title.genres, rating, credits: credits.rows };
}