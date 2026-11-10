/**
 * Data-access layer for user title ratings (`user_title_ratings` table).
 */
import { pool } from '../db.js';

// Structure of the data from the database
export interface UserRating {
  uconst: number;
  tconst: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// What rateTitle returns to the route.
export interface RateResult {
  rating: UserRating;
  created: boolean; // true when the user had no active rating of the title before
}

// The structure of one item in the user's rating history. 
// ratingHistory() returns an array of these, which joins the rating with the title.
export interface RatingHistoryEntry {
  tconst: string;
  primaryTitle: string;
  rating: number;
  lastChange: Date;
}

// Shared SELECT, so every query returns the columns the Rating interface expects.
const SELECT = `
  SELECT uconst,
          tconst,
          rating,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
  FROM user_title_ratings`;

// A user's rating history, paged and ordered newest change first.
// Uses get_title_rating_history() which joins ratings with title names.
export async function ratingHistory(
  uconst: number, limit: number, offset: number): Promise<RatingHistoryEntry[]> {
  const { rows } = await pool.query<RatingHistoryEntry>(
    `SELECT tconst,
            title_name  AS "primaryTitle",
            rating,
            last_change AS "lastChange"
      FROM get_title_rating_history($1)
      ORDER BY last_change DESC, tconst
      LIMIT $2 OFFSET $3`,
    [uconst, limit, offset]);
  return rows;
}

// Total number of ratings for the user.
export async function countRatings(uconst: number): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM get_title_rating_history($1)',
  [uconst]);
  return rows[0].total;
}

// Returns one title rating of a user, or undefined if none exists.
export async function getRating(uconst: number, tconst: string): Promise<UserRating | undefined> {
  const { rows } = await pool.query<UserRating>(
    `${SELECT} WHERE uconst = $1 AND tconst = $2 AND deleted_at IS NULL`,
    [uconst, tconst]);
  return rows[0];
}

// Creates or changes the user's rating of a title with rate(), which also
// updates the title's average and the name ratings.
// rate() returns VOID, so the stored row is read back in the same transaction.
// created is true for a first rating and for rating again after a removal and
// false when an active rating is changed or repeated.
// Returns undefined when no such title exists.
export async function rateTitle(
  uconst: number, tconst: string, rating: number): Promise<RateResult | undefined> {
  // rate() raises the same error code for every failure, so the unknown
  // title (404) is checked here instead of parsed from the error message.
  const title = await pool.query('SELECT 1 FROM titles WHERE tconst = $1', [tconst]);
  if (!title.rowCount) return undefined; // unknown title: the route turns this into 404

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // checks if the user already has a rating
    const active = await client.query(
      `SELECT 1 FROM user_title_ratings
        WHERE uconst = $1 AND tconst = $2 AND deleted_at IS NULL
        FOR UPDATE`, // lock the active rating row (if any) until COMMIT
      [uconst, tconst]); // one row if the user has an active rating, none if new or soft-deleted

    // writes the rating and updates title averages and name ratings
    await client.query('SELECT rate($1, $2, $3)', [uconst, tconst, rating]);

    // read back the row rate() just wrote
    const { rows } = await client.query<UserRating>(
      `${SELECT} WHERE uconst = $1 AND tconst = $2`, [uconst, tconst]);

    await client.query('COMMIT');
    return { rating: rows[0], created: !active.rowCount }; // no active rating before means the vote is new (201)
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Removes the user's active rating of a title with remove_rating(), which
// soft-deletes it and takes the vote out of the title's average.
// Returns false when the user has no active rating of the title.
export async function deleteRating(uconst: number, tconst: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // check for an active rating
    const active = await client.query(
      `SELECT 1 FROM user_title_ratings
        WHERE uconst = $1 AND tconst = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [uconst, tconst]);
    if (!active.rowCount) { // no active rating found
      await client.query('ROLLBACK');
      return false;
    }

    // soft-deletes the rating and updates title average and name ratings
    await client.query('SELECT remove_rating($1, $2)', [uconst, tconst]);

    await client.query('COMMIT');
    return true; // the route turns this into 204
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
