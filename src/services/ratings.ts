import * as ratings from "../data/ratings.js";
import { checkTitleExists } from "../data/titles.js";
import { pool } from "../db.js";
import { NotFound } from "../middleware/errors.js";

export interface RateResult {
  rating: ratings.UserRating;
  created: boolean; // true when the user had no active rating of the title before
}

export async function rateTitle(uconst: number, tconst: string, rating: number): Promise<RateResult> {
  if (!(await checkTitleExists(tconst))) throw new NotFound('Title not found');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hadActive = await ratings.lockActiveRatingOn(client, uconst, tconst);
    await ratings.rateOn(client, uconst, tconst, rating);
    const stored = await ratings.findOn(client, uconst, tconst);
    if (!stored) throw new Error(`Rating ${uconst}/${tconst} missing right after rate()`);
    await client.query('COMMIT');
    return { rating: stored, created: !hadActive };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}