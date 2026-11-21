/**
 * Authentication service: validates credentials and issues JWTs.
 *
 * The same `401 Unauthorized` is thrown whether the username does not exist
 * or the password is wrong, so the caller cannot tell which one failed.
 *
 * - `login(input)` — verifies credentials and returns a signed JWT on success.
 */
import { checkPassword, signToken } from '../auth/crypto.js';
import { Unauthorized } from '../middleware/errors.js';
import * as users from '../data/users.js';

/** Credentials submitted on login. */
export interface LoginInput {
  username: string;
  password: string;
}

/**
 * Verifies the credentials and returns a signed JWT on success.
 *
 * @param input - The username and plaintext password to authenticate.
 * @returns The authenticated user's `uconst` and a signed JWT valid for 12 hours.
 * @throws {Unauthorized} When the username does not exist or the password does not match.
 */
export async function login(input: LoginInput): Promise<{ uconst: number; token: string }> {
  const user = await users.getByUsername(input.username);
  const ok = user !== undefined && (await checkPassword(input.password, user.passwordHash));
  if (!ok) throw new Unauthorized('Wrong username or password');
  return { uconst: user.uconst, token: signToken({ uconst: user.uconst }) };
}
