import { pool } from '../db.js';

export interface User {
  uconst: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export async function users(): Promise<User[]> {
  const { rows } = await pool.query<User>(
    `SELECT uconst,
            first_name      AS "firstName",
            last_name       AS "lastName",
            username,
            email,
            password_hash    AS "passwordHash",
            created_at      AS "createdAt"
    FROM users
    ORDER BY first_name
    LIMIT 25 OFFSET 100`
  );
  return rows;
}

// One user by id, or undefined when no such user exists.
export async function getUser(uconst: number): Promise<User | undefined> {
  const { rows } = await pool.query<User>(
    `SELECT uconst,
            first_name      AS "firstName",
            last_name       AS "lastName",
            username,
            email,
            password_hash   AS "passwordHash",
            created_at      AS "createdAt"
    FROM get_user_by_id($1)`,
    [uconst]
  );
  return rows[0];
}

// Deletes the user with delete_user(), which also removes their ratings from
// the title averages; bookmarks and search history go via ON DELETE CASCADE.
// delete_user() returns VOID and says nothing when the user is unknown, so the
// existence check runs first, in the same transaction. 
// Returns false when no such user exists.
export async function deleteUser(uconst: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      'SELECT 1 FROM get_user_by_id($1) FOR UPDATE',
      [uconst]
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query('SELECT delete_user($1)', [uconst]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}