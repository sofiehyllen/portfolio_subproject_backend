/**
 * Data-access layer for user title ratings (`user_title_ratings` table).
 *
 * Types:
 * - `UserRating` — a rating row as stored: uconst, tconst, rating, and created/updated/deleted timestamps.
 * - `RatingHistoryEntry` — a user's rating joined with the title name, used in rating history responses.
 *
 * Query functions:
 * - `ratingHistory(uconst, limit, offset)` — paged rating history for the user, newest change first.
 * - `countRatings(uconst)` — total number of ratings in the user's history.
 * - `getRating(uconst, tconst)` — the user's active rating for a title, or undefined if none exists.
 * - `lockActiveRatingOn(client, uconst, tconst)` — locks the active rating row for update; true if one exists.
 * - `rateOn(client, uconst, tconst, rating)` — writes the rating via rate(), which also updates averages.
 * - `findOn(client, uconst, tconst)` — returns the stored rating row on the given client.
 * - `deleteRating(uconst, tconst)` — soft-deletes the rating via remove_rating(); returns false if none was found.
 */
import { PoolClient } from "pg";
import { pool } from '../db.js';

/**
 * A rating row stored in `user_title_ratings`
 * @property uconst       - ID of the user
 * @property tconst       - ID of the title
 * @property rating       - rating (1-10)
 * @property createdAt    - when the rating was first given
 * @property updatedAt    - when the rating was last changed
 * @property deletedAt    - when the rating was removed
 */
export interface UserRating {
  uconst: number;
  tconst: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * One item in a user's rating history: the rating joined with the title name
 * @property tconst           - ID of the rated title
 * @property primaryTitle     - name of the title
 * @property rating           - rating (1-10)
 * @property lastChange       - when the rating was lasat changed 
 */
export interface RatingHistoryEntry {
  tconst: string;
  primaryTitle: string;
  rating: number;
  lastChange: Date;
}

/** Shared SELECT, so every query returns the columns {@link UserRating} expects. */
const SELECT = `
  SELECT uconst,
          tconst,
          rating,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
  FROM user_title_ratings`;

/**
 * gets a page of the user's rating history, newest change first, with `get_users_title_rating_history()`
 * which joins rating with title names
 * 
 * @param uconst        - ID of the user
 * @param limit         - maximum number of entries to return
 * @param offset        - number of entries to skip
 * @returns               the entries on this page
 */
export async function ratingHistory(
  uconst: number, limit: number, offset: number): Promise<RatingHistoryEntry[]> {
  const { rows } = await pool.query<RatingHistoryEntry>(
    `SELECT tconst,
            title_name  AS "primaryTitle",
            rating,
            last_change AS "lastChange"
      FROM get_users_title_rating_history($1)
      ORDER BY last_change DESC, tconst
      LIMIT $2 OFFSET $3`,
    [uconst, limit, offset]);
  return rows;
}

/**
 * Counts the entries in the user's rating history (the total for {@link ratingHistory})
 * @param uconst      - ID of the user
 * @returns             the number of entries
 */
export async function countRatings(uconst: number): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM get_users_title_rating_history($1)',
  [uconst]);
  return rows[0].total;
}

/**
 * Gets the user's active rating of a title
 * @param uconst      - ID of the user
 * @param tconst      - ID of the title
 * @returns             the rating or `undefined` when the user has no active ratings
 */
export async function getRating(uconst: number, tconst: string): Promise<UserRating | undefined> {
  const { rows } = await pool.query<UserRating>(
    `${SELECT} WHERE uconst = $1 AND tconst = $2 AND deleted_at IS NULL`,
    [uconst, tconst]);
  return rows[0];
}

/**
 * Locks the user's active rating of the title, if any, until transaction ends.
 * 
 * @param client        - the client holding the open transaction
 * @param uconst        - ID of the user
 * @param tconst        - ID of the title
 * @returns               `true` when an active rating existed
 */
export async function lockActiveRatingOn(client: PoolClient, uconst: number, tconst: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM user_title_ratings
      WHERE uconst = $1 AND tconst = $2 AND deleted_at IS NULL
      FOR UPDATE`,
    [uconst, tconst]);
  return (rowCount ?? 0) > 0;
}

/**
 * Writes the rating with `rate()`, which also updates the title's average and the name ratings.
 * @param client        - the client holding the open transaction
 * @param uconst        - ID of the user
 * @param tconst        - ID of the title
 * @param rating          the rating (1-10)
 */
export async function rateOn(client: PoolClient, uconst: number, tconst: string, rating: number): Promise<void> {
  await client.query('SELECT rate($1, $2, $3)', [uconst, tconst, rating]);
}

/**
 * Reads the stored rating row on the given client so it sees the transaciton's own writes. 
 * Unlike {@link getRating} it also returns a deleted row
 * @param client        - the client holding the open transaction
 * @param uconst        - ID of the user
 * @param tconst        - ID of the title
 * @returns               the row or `undefined` when none exists
 */
export async function findOn(client: PoolClient, uconst: number, tconst: string): Promise<UserRating | undefined> {
  const { rows } = await client.query<UserRating>(
    `${SELECT} WHERE uconst = $1 AND tconst = $2`, [uconst, tconst]);
  return rows[0];
}

/**
 * Removes the user's active rating of a title with remove_rating(), which
 * soft-deletes it, takes the vote out of the title's average and updates
 * the name ratings, all in one call.
 * @param uconst        - ID of the user
 * @param tconst        - ID of the title
 * @returns             ` false` when the user has no active rating of the title
 */
export async function deleteRating(uconst: number, tconst: string): Promise<boolean> {
  const { rows } = await pool.query<{ deleted: boolean }>(
    'SELECT remove_rating($1, $2) AS deleted',
    [uconst, tconst]);
  return rows[0].deleted;
}