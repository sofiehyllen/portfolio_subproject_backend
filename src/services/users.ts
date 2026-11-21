/**
 * User account operations: registration, profile update and password change.
 *
 * Enforces database-level uniqueness rules (username and email) and hashes
 * passwords before they are stored. Input types are defined here and imported
 * by `validation.ts`.
 *
 * - `register(input)`                — creates a new user account.
 * - `updateProfile(uconst, changes)` — changes first/last name or email.
 * - `changePassword(uconst, input)`  — replaces the password after checking the current one.
 */
import * as users from "../data/users.js";
import { pool } from "../db.js";
import { Conflict, Forbidden, NotFound } from "../middleware/errors.js";
import { checkPassword, hashPassword } from "../auth/crypto.js";

/**
 * Validated body of `POST /api/users`.
 * `password` is plaintext; {@link register} hashes it
 */
export interface NewUserInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

/**
 * Validated body of `PATCH /api/users/{uconst}`.
 * A field left out keeps its current value
 */
export interface UserUpdateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
}
/**
 * Validated body of `PUT /api/users/{uconst}/password`.
 * Both passwords are plaintext
 */
export interface PasswordUpdateInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Registers a new user. The password is hashed before it is stored.
 * 
 * The two requests happening at the same time can both pass the uniqueness chaks
 * the secons insert then fails on the UNIQUE constraint and the client gets `500`.
 * 
 * @param input     - the validated registration data 
 * @returns           the stored user
 * @throws {Conflict} when the username or email is already taken
 */
export async function register(input: NewUserInput): Promise<users.User> {
  if (await users.usernameTaken(input.username)) { 
    throw new Conflict('Username already taken');
  }

  if (await users.emailTaken(input.email)) { 
    throw new Conflict('Email already taken');
  }
  // Two requests at the same moment can both pass the checks above; the second
  // insert then fails on the UNIQUE constraint and the client gets 500.

  const uconst = await users.create({
    firstName: input.firstName,
    lastName: input.lastName,
    username: input.username,
    email: input.email,
    passwordHash: await hashPassword(input.password) // the plain password is never stored
  });

  const user = await users.get(uconst);
  if (!user) throw new Error(`user ${uconst} missing right after create`);
  return user;
}


/**
 * Applies a profile update and returns the updated user
 * The row lock and the update run in one transaction on one client
 * 
 * @param uconst        - ID of the user 
 * @param changes       - the fields to change; a field left out keeps its value
 * @returns               the updated user
 * @throws {Conflict}     when the new email belongs to another user
 * @throws {NotFound}     when the user does not exist
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

  const user = await users.get(uconst);
  if (!user) throw new NotFound('User not found');
  return user;
}

/**
 * Replaces the user's password after checking the current one
 * The route checks the new password's rules before calling this
 * 
 * @param uconst      - ID of the user
 * @param input       - the current and the new plaintext password
 * @throws {NotFound}   when the user does not exist
 * @throws {Forbidden}  when `currentPassword` is wrong
 */
export async function changePassword(uconst: number, input: PasswordUpdateInput): Promise<void> {
  const user = await users.get(uconst);
  if (!user) throw new NotFound('User not found');

  if (!(await checkPassword(input.currentPassword, user.passwordHash))) {
    throw new Forbidden('Current password is invalid');
  }
  await users.updatePassword(uconst, await hashPassword(input.newPassword));
}
