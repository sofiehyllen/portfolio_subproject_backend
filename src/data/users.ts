/**
 * Data-access layer for the `users` table.
 *
 * Types:
 * - `User` — a user row as stored, including the password hash.
 * - `NewUser` — the fields required to create a new user.
 * - `UserChanges` — fields of a profile update; omitted fields keep their current value.
 *
 * Query functions:
 * - `createUser(user)` — inserts a new user via create_user(); returns the new uconst.
 *   A duplicate username or email propagates PostgreSQL error 23505 unchanged.
 * - `getUser(uconst)` — one user by id, or undefined when no such user exists.
 * - `lockOn(client, uconst)` — locks the user's row for update; true when the user exists.
 * - `updateOn(client, uconst, changes)` — updates profile fields via update_user(); username is never changed.
 * - `deleteUser(uconst)` — deletes the user via delete_user(), which also removes their ratings
 *   from title averages; bookmarks and search history are removed via ON DELETE CASCADE.
 * - `updateUserHashPassword(uconst, newHash)` — replaces the stored password hash.
 */
import { PoolClient } from "pg";
import { pool } from '../db.js';

// A user as stored, including the password hash. Routes send it to clients
// only through toUserDto, which leaves the hash out.
export interface User {
  uconst: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface NewUser {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
}

// Fields of a profile update; a field left out keeps its current value.
export interface UserChanges {
  firstName?: string;
  lastName?: string;
  email?: string;
}

// Creates a user with create_user() and returns the new uconst.
// A duplicate username or email fails on the UNIQUE constraints with 23505;
// the error is passed on unchanged.
export async function createUser(user: NewUser): Promise<number> {
  const { rows } = await pool.query<{ uconst: number }>(
    'SELECT create_user($1, $2, $3, $4, $5) AS uconst',
    [user.firstName, user.lastName, user.username, user.email, user.passwordHash]
  );
  return rows[0].uconst;
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

// Locks the user's row until COMMIT. True when the user exists.
export async function lockOn(client: PoolClient, uconst: number): Promise<boolean> {
  const { rowCount } = await client.query('SELECT 1 FROM users WHERE uconst = $1 FOR UPDATE', [uconst]);
  return (rowCount ?? 0) > 0;
}

// Updates the user with update_user(), which keeps the current value for
// every NULL argument, so the username (always NULL here) never changes.
export async function updateOn(client: PoolClient, uconst: number, changes: UserChanges): Promise<void> {
  await client.query(
    'SELECT update_user($1, $2, $3, NULL, $4)',
    [uconst, changes.firstName ?? null, changes.lastName ?? null, changes.email ?? null]
  );
}

// Deletes the user with delete_user(), which also removes their ratings from
// the title averages; bookmarks and search history go via ON DELETE CASCADE.
// Returns false when no such user exists.
export async function deleteUser(uconst: number): Promise<boolean> {
  const { rows } = await pool.query<{ deleted: boolean }>(
    'SELECT delete_user($1) AS deleted',
    [uconst]
  );
  return rows[0].deleted;
}

// Updated the user's password hash using update_user_password().
export async function updateUserHashPassword(uconst: number, newHash: string): Promise<void> {
  await pool.query(`
    SELECT update_user_password($1, $2)`,
    [uconst, newHash]
  );
}
