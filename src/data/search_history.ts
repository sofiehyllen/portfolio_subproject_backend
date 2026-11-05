import { pool } from '../db.js';


export interface UserSearchHistory {
  sconst: number;
  search_string: string;
  created_at: Date;
}

export async function getUserSearchHistory(uconst: number, limit: number, offset: number) {
    const { rows: items } = await pool.query<UserSearchHistory>(`
        SELECT  sconst, search_string, created_at
        FROM get_search_history($1)
        ORDER BY created_at DESC, sconst DESC
        LIMIT $2
        OFFSET $3`,
        [uconst, limit, offset]);
    
    const { rows: countRows } = await pool.query(`
        SELECT count(*) AS total FROM get_search_history($1)`,
        [uconst]);

    const total = parseInt(countRows[0].total);

    return {items, total};
}
