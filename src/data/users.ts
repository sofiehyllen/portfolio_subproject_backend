import { pool } from '../db.js';

export interface User {
  uconst: string;
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
    FROM users
    WHERE uconst = $1`,
    [uconst]
    //add these lines and remove the comment to use the stored procedure instead of the query above
    // FROM get_user_by_id($1)`,
    //[uconst]
  );
  return rows[0];
}