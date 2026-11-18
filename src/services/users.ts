import * as users from "../data/users.js";
import { pool } from "../db.js";
import { BadRequest, Conflict, Forbidden, NotFound } from "../middleware/errors.js";
import { checkPassword, hashPassword } from "../auth/crypto.js";
import { validatePassword } from "../validation.js";

// The input of each operation. validation.ts imports these.
export interface NewUserInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

export interface UserUpdateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface PasswordUpdateInput {
  currentPassword: string;
  newPassword: string;
}

/** Stores a new user with a hashed password and returns the stored user. */
export async function register(input: NewUserInput): Promise<users.User> {
  if (await users.usernameTaken(input.username)) throw new Conflict('Username already taken');
  if (await users.emailTaken(input.email)) throw new Conflict('Email already taken');
  // Two requests at the same moment can both pass the checks above; the second
  // insert then fails on the UNIQUE constraint and the client gets 500.

  const uconst = await users.createUser({
    firstName: input.firstName,
    lastName: input.lastName,
    username: input.username,
    email: input.email,
    passwordHash: await hashPassword(input.password) // the plain password is never stored
  });

  const user = await users.getUser(uconst);
  if (!user) throw new Error(`user ${uconst} missing right after create`);
  return user;
}


/**
 * Locks the user, applies the changes and returns the updated user.
 * The lock and the update run in one transaction on one client.
 */
export async function updateProfile(uconst: number, changes: UserUpdateInput): Promise<users.User> {
  if (changes.email !== undefined && (await users.emailTaken(changes.email, uconst))) {
    throw new Conflict('Email already taken');
  }
  // Two requests at the same moment can both pass the check above; the second
  // update then fails on the UNIQUE constraint and the client gets 500.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await users.lockOn(client, uconst))) throw new NotFound('User not found');
    await users.updateOn(client, uconst, changes);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const user = await users.getUser(uconst);
  if (!user) throw new NotFound('User not found');
  return user;
}


/** Replaces the password when the current one is correct. */
export async function changePassword(uconst: number, input: PasswordUpdateInput): Promise<void> {
  const user = await users.getUser(uconst);
  if (!user) throw new NotFound('User not found');

  if (!(await checkPassword(input.currentPassword, user.passwordHash))) {
    throw new Forbidden('Current password is invalid');
  }
  await users.updatePassword(uconst, await hashPassword(input.newPassword));
}
