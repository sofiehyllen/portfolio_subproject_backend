import { pool } from '../db.js';

export interface Title {
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

export async function titles(): Promise<Title[]> {
  const { rows } = await pool.query<Title>(
    `SELECT title_type AS "titleType",
            primary_title AS "primaryTitle",
            original_title AS "originalTitle",
            is_adult AS "isAdult",
            start_year AS "startYear::float8",
            end_year AS "endYear::float8",
            runtime_minutes AS "runtimeMinutes::float8",
            awards,
            poster_url AS "posterUrl",
            plot
    FROM titles
    ORDER BY primary_title
    LIMIT 25 OFFSET 100`);
    return rows;
}