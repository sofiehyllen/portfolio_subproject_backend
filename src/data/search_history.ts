/**
 * Data-access layer for user search history (`search_history` table).
 *
 * Types:
 * - `UserSearchHistory` — one search history entry: sconst, search string and creation timestamp.
 *
 * Query functions:
 * - `getUserSearchHistory(uconst, limit, offset)` — paged search history for the user, newest first.
 * - `deleteUserSearchHistory(uconst)` — clears all search history for the user via clear_search_history();
 *   returns false when the history was already empty.
 * - `deleteUserSearchHistoryEntry(uconst, sconst)` — removes one entry via clear_search_history_entry();
 *   returns false when the entry was not found or does not belong to the user.
 */
import { pool } from '../db.js';


/**
 * One entry in a user's search history
 * @property sconst         - ID of the entry
 * @property searchString   - the search as it was logged
 * @property createdAt      - when the search was made
 */
export interface UserSearchHistory {
  sconst: number;
  searchString: string;
  createdAt: Date;
}

/**
 * Gets a page of the user's search history, newest first, plus the total number of entries. 
 * THe page query and the count query run in parallel.
 * 
 * @param uconst            - ID of the user
 * @param limit             - maximum number of the entries to return    
 * @param offset            - number of entries to skip
 * @returns                   the entries on this page and the total count
 */
export async function getUserSearchHistory(uconst: number, limit: number, offset: number): Promise<{items: UserSearchHistory[], total: number}> {
    // The page and the count are independent, so they run in parallel.
    const [page, count] = await Promise.all([
        pool.query<UserSearchHistory>(`
            SELECT  sconst,
                    search_string as "searchString",
                    created_at as "createdAt"
            FROM get_search_history($1)
            ORDER BY created_at DESC, sconst DESC
            LIMIT $2
            OFFSET $3`,
            [uconst, limit, offset]),
        pool.query<{ total: number }>(
            'SELECT count(*)::int AS total FROM get_search_history($1)',
            [uconst]),
    ]);

    return { items: page.rows, total: count.rows[0].total };
}

/**
 * Deletes the user's entire search history with `clear_search_history()`
 * 
 * @param uconst        - ID of the user
 * @returns               `false` when the history was already empty
 */
export async function deleteUserSearchHistory(uconst: number): Promise<boolean> {
    const { rows } = await pool.query<{ deleted: boolean }>(
        'SELECT clear_search_history($1) AS deleted',
        [uconst]);
    return rows[0].deleted;
}

/**
 * Deletes one search history entry with `clear_search_history_entry()` only if it belogns to the user
 * @param uconst    - ID of the user
 * @param sconst    - ID of the entry
 * @returns           `false` when the user has no such entry
 */
export async function deleteUserSearchHistoryEntry(uconst: number, sconst: number): Promise<boolean> {
    const { rows } = await pool.query<{ deleted: boolean }>(
        'SELECT clear_search_history_entry($1, $2) AS deleted',
        [uconst, sconst]);
    return rows[0].deleted;
}
