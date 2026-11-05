import { pool } from '../db.js';

export interface BookmarkTitle {
  uconst: number;
  tconst: string;
  createdAt: string;
}

export interface BookmarkPerson {
  uconst: number;
  nconst: string;
  createdAt: string;
}

/*      Bookmarks     */

//Get list of users bookmarked titles
export async function getTitleBookmarks(uconst: number): Promise<BookmarkTitle[]> {
  const { rows } = await pool.query<BookmarkTitle>(
    `SELECT uconst, tconst, created_at AS "createdAt"
    FROM get_title_bookmarks($1)`,
    [uconst]
  );
  return rows;
}

// Create title bookmark
export async function addTitleBookmark(uconst: number, tconst: string): Promise<BookmarkTitle> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if user exist
        await client.query(
            `SELECT uconst
            FROM users
            WHERE uconst = $1`,
            [uconst]
        );

        // Check if title exist
        await client.query(
            `SELECT tconst
            FROM titles
            WHERE tconst = $2`,
            [tconst]
        );

        // Add title to bookmark_title
        const { rows } = await client.query<BookmarkTitle>(
            `SELECT add_title_bookmark($1, $2)`,
            [uconst, tconst]
        );

        await client.query('COMMIT');
        return rows[0];
        
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
        
    } finally {
        client.release();
    }
//   const { rows } = await pool.query<BookmarkTitle>(
//     `SELECT add_title_bookmark($1, $2)`,
//     [uconst, tconst]
//   );
//   return rows[0];
}

// Delete title bookmark - Check if user and title exist before deleting - Is that necessary?
export async function removeTitleBookmark(uconst: number, tconst: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if uconst and tconst exist in bookmark_title
        await client.query(
            `SELECT *
            FROM bookmark_title
            WHERE uconst = $1
                AND tconst = $2`,
            [uconst, tconst]
        );

        // Remove title to bookmark_title
        const row = await client.query<BookmarkTitle>(
            `SELECT remove_title_bookmark($1, $2)`,
            [uconst, tconst]
        );

        await client.query('COMMIT');
        return row.rowCount === 1;
        
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
        
    } finally {
        client.release();
    }
}

// Delete title bookmark - No check
// export async function removeTitleBookmark(uconst: number, tconst: string): Promise<boolean> {
//   const row = await pool.query<BookmarkTitle>(
//     `SELECT remove_title_bookmark($1, $2)`,
//     [uconst, tconst]
//   );
//   return row.rowCount === 1;
// }



//Get list of users bookmarked persons
export async function getPersonBookmarks(uconst: number): Promise<BookmarkPerson[]> {
  const { rows } = await pool.query<BookmarkPerson>(
    `SELECT uconst, nconst, created_at AS "createdAt"
    FROM get_person_bookmarks($1)`,
    [uconst]
  );
  return rows;
}

// Create person bookmark
export async function addPersonBookmark(uconst: number, nconst: string): Promise<BookmarkPerson> {
  const { rows } = await pool.query<BookmarkPerson>(
    `SELECT add_person_bookmark($1, $2)`,
    [uconst, nconst]
  );
  return rows[0];
}

// Delete person bookmark
export async function removePersonBookmark(uconst: number, nconst: string): Promise<boolean> {
  const row = await pool.query<BookmarkPerson>(
    `SELECT remove_person_bookmark($1, $2)`,
    [uconst, nconst]
  );
  return row.rowCount === 1;
}