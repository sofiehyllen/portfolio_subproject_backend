/**
 * Data-access layer for word associations, built on the `word_index` table.
 *
 * Types:
 * - `RelatedWord` — a word associated with a set of titles, with a count of how many contain it.
 *
 * Query functions:
 * - `relatedWords(words)` — the words most associated with the titles that contain all the given
 *   words, most frequent first. Returns at most 10 words via word_to_word_querying().
 */
import { pool } from '../db.js';

/**
 * A word associated with a set of titles
 * @property word     - the associated word
 * @property count    - how many of the matching titles contain the word
 */
export interface RelatedWord {
  word: string;
  count: number; // how many of the matching titles contain the word
}

/**
 * Finds the words most associated with the titles that contain all the given words
 * `word_to_word_querying()` returns at most 10 words 
 * @param words     - the words to match 
 * @returns           the related words, sorted by frequency, then alphabetically
 */
export async function relatedWords(words: string[]): Promise<RelatedWord[]> {
  const { rows } = await pool.query<RelatedWord>(
    `SELECT t_word        AS word,
            t_count::int  AS count
     FROM word_to_word_querying(VARIADIC $1::text[])
     ORDER BY t_count DESC, t_word`,
    [words]);
  return rows;
}
