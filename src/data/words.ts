/**
 * Data-access layer for word associations, built on the `word_index` table.
 */
import { pool } from '../db.js';

export interface RelatedWord {
  word: string;
  count: number; // how many of the matching titles contain the word
}

// The words most associated with the titles that contain all the given words,
// most frequent first. word_to_word_querying() returns at most 10 words.
export async function relatedWords(words: string[]): Promise<RelatedWord[]> {
  const { rows } = await pool.query<RelatedWord>(
    `SELECT t_word        AS word,
            t_count::int  AS count
     FROM word_to_word_querying(VARIADIC $1::text[])
     ORDER BY t_count DESC, t_word`,
    [words]);
  return rows;
}
