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

// Structure of the data from the database
export interface UserRating {
  uconst: number;
  tconst: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
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

// Locks the user's active rating of the title, if any, until COMMIT.
// True when there was one.
export async function lockActiveRatingOn(client: PoolClient, uconst: number, tconst: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM user_title_ratings
      WHERE uconst = $1 AND tconst = $2 AND deleted_at IS NULL
      FOR UPDATE`,
    [uconst, tconst]);
  return (rowCount ?? 0) > 0;
}

// Writes the rating with rate(), which also updates the title's average and the name ratings.
export async function rateOn(client: PoolClient, uconst: number, tconst: string, rating: number): Promise<void> {
  await client.query('SELECT rate($1, $2, $3)', [uconst, tconst, rating]);
}

// The stored rating row, read on the given client.
export async function findOn(client: PoolClient, uconst: number, tconst: string): Promise<UserRating> {
  const { rows } = await client.query<UserRating>(
    `${SELECT} WHERE uconst = $1 AND tconst = $2`, [uconst, tconst]);
  return rows[0];
}

// Removes the user's active rating of a title with remove_rating(), which
// soft-deletes it, takes the vote out of the title's average and updates
// the name ratings, all in one call.
export async function deleteRating(uconst: number, tconst: string): Promise<boolean> {
  const { rows } = await pool.query<{ deleted: boolean }>(
    'SELECT remove_rating($1, $2) AS deleted',
    [uconst, tconst]);
  return rows[0].deleted;
}