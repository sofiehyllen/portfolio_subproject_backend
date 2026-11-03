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
            password_has    AS "passwordHash",
            created_at      AS "createdAt"
    FROM users
    ORDER BY first_name
    LIMIT 25 OFFSET 100`
  );
  return rows;
}