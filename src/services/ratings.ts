import { findOn, lockActiveRatingOn, rateOn, UserRating } from "../data/ratings.js";
import { exists } from "../data/titles.js";
import { pool } from "../db.js";
import { NotFound } from "../middleware/errors.js";

export interface RateResult {
  rating: UserRating;
  created: boolean; // true when the user had no active rating of the title before
}

export async function rateTitle(uconst: number, tconst: string, rating: number): Promise<RateResult> {
  if (!(await exists(tconst))) throw new NotFound('Title not found');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hadActive = await lockActiveRatingOn(client, uconst, tconst);
    await rateOn(client, uconst, tconst, rating);
    const stored = await findOn(client, uconst, tconst);
    await client.query('COMMIT');
    return { rating: stored, created: !hadActive };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}