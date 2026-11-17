import { pool } from '../db.js';


export interface UserSearchHistory {
  sconst: number;
  searchString: string;
  createdAt: Date;
}

export async function getUserSearchHistory(uconst: number, limit: number, offset: number): Promise<{items: UserSearchHistory[], total: number}> {
    const { rows: items } = await pool.query<UserSearchHistory>(`
        SELECT  sconst, 
                search_string as "searchString", 
                created_at as "createdAt"
        FROM get_search_history($1)
        ORDER BY created_at DESC, sconst DESC
        LIMIT $2
        OFFSET $3`,
        [uconst, limit, offset]);
    
    const { rows: countRows } = await pool.query(`
        SELECT count(*)::int AS total FROM get_search_history($1)`,
        [uconst]);

    return { items, total: countRows[0].total };

}

// Deletes the user's entire search history with clear_search_history().
// Returns false when the history was already empty;
export async function deleteUserSearchHistory(uconst: number): Promise<boolean> {
    const { rows } = await pool.query<{ deleted: boolean }>(
        'SELECT clear_search_history($1) AS deleted',
        [uconst]);
    return rows[0].deleted;
}

// Deletes one search with clear_search_history_entry(), only if it
// belongs to the user.
export async function deleteUserSearchHistoryEntry(uconst: number, sconst: number): Promise<boolean> {
    const { rows } = await pool.query<{ deleted: boolean }>(
        'SELECT clear_search_history_entry($1, $2) AS deleted',
        [uconst, sconst]);
    return rows[0].deleted;
}
