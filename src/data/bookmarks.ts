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
  const { rows } = await pool.query<BookmarkTitle>(
    `SELECT add_title_bookmark($1, $2)`,
    [uconst, tconst]
  );
  return rows[0];
}

// Delete title bookmark
export async function removeTitleBookmark(uconst: number, tconst: string): Promise<boolean> {
  const row = await pool.query<BookmarkTitle>(
    `SELECT remove_title_bookmark($1, $2)`,
    [uconst, tconst]
  );
  return row.rowCount === 1;
}



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