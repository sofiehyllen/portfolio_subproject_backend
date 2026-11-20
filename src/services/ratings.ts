/**
 * Rating operations that span several queries and must run in one transaction
 * 
 * - `rateTitle(uconst, tconst, rating)`  - creates or cahgnes a user's rating of a title
 */
import * as ratings from "../data/ratings.js";
import { checkTitleExists } from "../data/titles.js";
import { pool } from "../db.js";
import { NotFound } from "../middleware/errors.js";

/**
 * Result of {@link rateTitle}
 * @property rating   - the rating as stored after write.
 * @property created  - `true` when the user had no active rating of the title before,
 *  `false` when an existing rating was changed
 */
export interface RateResult {
  rating: ratings.UserRating;
  created: boolean; // true when the user had no active rating of the title before
}

/**
 * Created or changes a user's rating of a title
 * 
 * Runs in one transaction: locks the user's active rating (if any), writes the new value
 * with `rate()` and reads the stored row back. Any error rolls the transaction back
 *
 * @param uconst      - ID of the user
 * @param tconst      - ID of the title
 * @param rating      - the rating (an integer from 1 to 10)
 * @returns           the stored rating and whether it wasa newly created
 * @throws {NotFound} When no title with this `tconst` exists
 */
export async function rateTitle(uconst: number, tconst: string, rating: number): Promise<RateResult> {
  if (!(await checkTitleExists(tconst))) {
    throw new NotFound('Title not found');
  
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hadActive = await ratings.lockActiveRatingOn(client, uconst, tconst);
    await ratings.rateOn(client, uconst, tconst, rating);

    const stored = await ratings.findOn(client, uconst, tconst);
    if (!stored) {
      throw new Error(`Rating ${uconst}/${tconst} missing right after rate()`);
    }

    await client.query('COMMIT');
    
    return { rating: stored, created: !hadActive };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}