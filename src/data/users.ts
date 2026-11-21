/**
 * Data-access layer for the `users` table.
 *
 * Types:
 * - `User` — a user row as stored, including the password hash.
 * - `NewUser` — the fields required to create a new user.
 * - `UserChanges` — fields of a profile update; omitted fields keep their current value.
 *
 * Query functions:
 * - `create(user)` — inserts a new user via create_user(); returns the new uconst.
 *   A duplicate username or email propagates PostgreSQL error 23505 unchanged.
 * - `get(uconst)` — one user by id, or undefined when no such user exists.
 * - `getByUsername(username)` — one user by username, or undefined when no such user exists.
 * - `usernameTaken(username)` — true when a user already has this username.
 * - `emailTaken(email, exceptUconst?)` — true when a user other than exceptUconst already has
 *   this email; pass exceptUconst on update so a user may keep their own email.
 * - `lockOn(client, uconst)` — locks the user's row for update; true when the user exists.
 * - `updateOn(client, uconst, changes)` — updates profile fields via update_user(); username is never changed.
 * - `remove(uconst)` — deletes the user via delete_user(), which also removes their ratings
 *   from title averages; bookmarks and search history are removed via ON DELETE CASCADE.
 *   Returns false when no such user exists.
 * - `updatePassword(uconst, newHash)` — replaces the stored password hash via update_user_password().
 */
import { PoolClient } from "pg";
import { pool } from '../db.js';

/**
 * A user as stored, including the password hash. Never send this to a client; use `toUserDto`
 * 
 * @property uconst       - ID of the user
 * @property firstName    - fist name
 * @property lastName     - last name
 * @property username     - unique username, stored in lower case
 * @property email        - unique email, stored in lower case
 * @property passwordHash - password hash in `scrypt$<salt>$<hash>` format
 * @property createdAt    - when the account was created
*/
export interface User {
  uconst: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/** The fields neede to create a user. The password is already hashed */
export interface NewUser {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
}

/**Fields of a profile update; a field left out keeps its current value. */
export interface UserChanges {
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * Creates a user with `create_user()`.
 * A duplicate username or email fails on the UNIQUE constraints with PostgreSQL error `23505`;
 * the error is passed on unchanged.
 * @param user    - the new user's fields with the password already hashed
 * @returns         the new user's `uconst`
 */
export async function create(user: NewUser): Promise<number> {
  const { rows } = await pool.query<{ uconst: number }>(
    'SELECT create_user($1, $2, $3, $4, $5) AS uconst',
    [user.firstName, user.lastName, user.username, user.email, user.passwordHash]
  );
  return rows[0].uconst;
}

/** The columns of a {@link User}, shared by `get` and `getByUsername`. */
const USER_COLUMNS = `
  uconst,
  first_name    AS "firstName",
  last_name     AS "lastName",
  username,
  email,
  password_hash AS "passwordHash",
  created_at    AS "createdAt"`;

/**
 * Gets one user by id with `get_user_by_id()`
 * 
 * @param uconst        - ID of the user
 * @returns               the user or `undefined` when no such user exists
 */
export async function get(uconst: number): Promise<User | undefined> {
  const { rows } = await pool.query<User>(
    `SELECT ${USER_COLUMNS} FROM get_user_by_id($1)`,
    [uconst]
  );
  return rows[0];
}

/**
 * Gets one user by usernamr with `get_user_by_username()`
 * @param username      - the username (in lower case)
 * @returns               the user or `undefined` when no such user exists
 */
export async function getByUsername(username: string): Promise<User | undefined> {
  const { rows } = await pool.query<User>(
    `SELECT ${USER_COLUMNS} FROM get_user_by_username($1)`,
    [username]
  );
  return rows[0];
}

/**
 * Checks whether a username is already in use
 * 
 * @param username            - the username (in lower case)
 * @returns                     `true` when a user already has this username
 */
export async function usernameTaken(username: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  return (rowCount ?? 0) > 0;
}

/**
 * Checks whether an email is already in used other than `exceptUconst`
 * @param email                 - the email (in lower case)
 * @param exceptUconst          - leave out for a new user; on update pass the user's own id so they can keep their email
 * @returns                       `true` when another user already has this email
 */
export async function emailTaken(email: string, exceptUconst?: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM users WHERE email = $1 AND uconst IS DISTINCT FROM $2',
    [email, exceptUconst ?? null]);
  return (rowCount ?? 0) > 0;
}

/**
 * Locks the user's row until the transaction ends
 * @param client          - the client holding the open transaction
 * @param uconst          - ID of the user
 * @returns                 `true` when the user exists
 */
export async function lockOn(client: PoolClient, uconst: number): Promise<boolean> {
  const { rowCount } = await client.query('SELECT 1 FROM users WHERE uconst = $1 FOR UPDATE', [uconst]);
  return (rowCount ?? 0) > 0;
}

/**
 * Updates profile fields with `update_user()` which keeps the current values for every `NULL` argument
 * @param client           - the client holding the open transaction
 * @param uconst           - ID of the user
 * @param changes            the fields to change
 */
export async function updateOn(client: PoolClient, uconst: number, changes: UserChanges): Promise<void> {
  await client.query(
    'SELECT update_user($1, $2, $3, NULL, $4)',
    [uconst, changes.firstName ?? null, changes.lastName ?? null, changes.email ?? null]
  );
}

/**
 * Deletes the user with delete_user(), which also removes their ratings from
 * the title averages; bookmarks and search history go via ON DELETE CASCADE.
 * @param uconst      - ID of the user
 * @returns             `false` when no such user exists
 */
export async function remove(uconst: number): Promise<boolean> {
  const { rows } = await pool.query<{ deleted: boolean }>(
    'SELECT delete_user($1) AS deleted',
    [uconst]
  );
  return rows[0].deleted;
}

/**
 * Replaces the user's password hash with `update_user_password()`
 * 
 * @param uconst          - ID of the user
 * @param newHash         - the new hash in `scrypt$<salt>$<hash>` format
 */
export async function updatePassword(uconst: number, newHash: string): Promise<void> {
  await pool.query(`
    SELECT update_user_password($1, $2)`,
    [uconst, newHash]
  );
}
