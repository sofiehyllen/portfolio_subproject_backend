import { pool } from '../db.js';

export interface BookmarkTitle {
  uconst: number;
  tconst: string;
  createdAt: Date;
}

export interface BookmarkPerson {
  uconst: number;
  nconst: string;
  createdAt: Date;
}

/*      Bookmarks     */

export async function count(): Promise<number> {
    const { rows } = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS "total"
        FROM bookmark_title`
    );
    return rows[0].total;
}

export async function listTitleBookmarks(uconst: number, limit: number, offset: number) {
    const { rows } = await pool.query<BookmarkTitle>(
        `SELECT t.primary_name AS "title", b.created_at AS "createdAt"
        FROM bookmark_title b
            NATURAL JOIN titles t
        WHERE b.uconst = $1
            AND b.tconst = t.tconst
        ORDER BY t.primary_name
        LIMIT $2
        OFFSET $3`,
        [uconst, limit, offset]
    );
    return rows;
}
//Get list of users bookmarked titles
export async function getTitleBookmarks(uconst: number, limit: number, offset: number): Promise<BookmarkTitle[] | undefined > {
  const { rows } = await pool.query<BookmarkTitle>(
    `SELECT title_name AS "titleName", created_at AS "createdAt"
    FROM get_title_bookmarks($1)
    LIMIT $2
    OFFSET $3`,
    [uconst, limit, offset]
  );

//   const { rows: countRows } = await pool.query(
//     `SELECT COUNT(*)::int AS "total"
//     FROM bookmark_title`
//   );

  //return { items, total: countRows[0].total};
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

        // Add new bookmark to bookmark_title
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
}

// Delete title bookmark
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

        // Remove bookmark from bookmark_title
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


//Get list of users bookmarked persons
export async function getPersonBookmarks(uconst: number): Promise<BookmarkPerson[]> {
  const { rows } = await pool.query<BookmarkPerson>(
    `SELECT person_name AS "personName", created_at AS "createdAt"
    FROM get_person_bookmarks($1)`,
    [uconst]
  );
  return rows;
}

// Create person bookmark
export async function addPersonBookmark(uconst: number, nconst: string): Promise<BookmarkPerson> {
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

        // Check if person exist
        await client.query(
            `SELECT nconst
            FROM persons
            WHERE nconst = $2`,
            [nconst]
        );

        // Add new bookmark to bookmark_person
        const { rows } = await client.query<BookmarkPerson>(
            `SELECT add_person_bookmark($1, $2)`,
            [uconst, nconst]
        );

        await client.query('COMMIT');
        return rows[0];
        
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
        
    } finally {
        client.release();
    }
}

// Delete person bookmark
export async function removePersonBookmark(uconst: number, nconst: string): Promise<boolean> {
  const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if uconst and nconst exist in bookmark_person
        await client.query(
            `SELECT *
            FROM bookmark_person
            WHERE uconst = $1
                AND nconst = $2`,
            [uconst, nconst]
        );

        // Remove bookmark from bookmark_person
        const row = await client.query<BookmarkPerson>(
            `SELECT remove_person_bookmark($1, $2)`,
            [uconst, nconst]
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