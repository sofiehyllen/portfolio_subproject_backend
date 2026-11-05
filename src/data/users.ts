import { pool } from '../db.js';
import { Conflict } from '../middleware/errors.js';

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
// The UNIQUE constraints on username and email make a duplicate fail with
// 23505; that becomes a Conflict (409). Checking first and inserting after
// would let two simultaneous sign-ups with the same username both pass.
export async function createUser(user: NewUser): Promise<number> {
  try {
    const { rows } = await pool.query<{ uconst: number }>(
      'SELECT create_user($1, $2, $3, $4, $5) AS uconst',
      [user.firstName, user.lastName, user.username, user.email, user.passwordHash]
    );
    return rows[0].uconst;
  } catch (err) {
    throw asConflict(err);
  }
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

// Updates the user with update_user(), which keeps the current value for
// every NULL argument, so the username (always NULL here) never changes.
// update_user() returns VOID and says nothing when the user is unknown, so
// the existence check runs first, in the same transaction, as in deleteUser.
// An email that belongs to another user becomes a Conflict (409).
// Returns false when no such user exists.
export async function updateUser(uconst: number, changes: UserChanges): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      'SELECT 1 FROM users WHERE uconst = $1 FOR UPDATE',
      [uconst]
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      'SELECT update_user($1, $2, $3, NULL, $4)',
      [uconst, changes.firstName ?? null, changes.lastName ?? null, changes.email ?? null]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw asConflict(err);
  } finally {
    client.release();
  }
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
      'SELECT 1 FROM users WHERE uconst = $1 FOR UPDATE',
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

// Turns a unique-constraint violation (23505) on users into a Conflict (409);
// any other error is returned unchanged.
function asConflict(err: unknown): unknown {
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr.code === '23505') {
    if (pgErr.constraint === 'users_username_key') return new Conflict('Username already taken');
    if (pgErr.constraint === 'users_email_key') return new Conflict('Email already taken');
  }
  return err;
}
