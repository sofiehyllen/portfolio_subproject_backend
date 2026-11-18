// Password hashing with Node's built-in scrypt, so no extra dependency is needed.
// Stored format: scrypt$<salt>$<hash>, both base64. The salt is random per
// password, so two users with the same password get different hashes.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// For login and password change: true when the password matches the stored hash.
export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected); // constant time, so timing reveals nothing
}

/**
 * Checks password rules: length, upper/lower case, digit, special character,
 * and optionally that it differs from the username and the current password.
 * @param optional Pass `username` and/or `currPassword` to enforce uniqueness rules.
 * @returns A list of error messages; empty when the password is valid. Does not throw.
 */
export function validatePassword(password: unknown, optional: { username?: string; currPassword?: string } = {}): string[] {
  if (typeof password !== 'string' || password === '') return ['password is required'];

  const errors: string[] = [];
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
    errors.push(`password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
  if (!/[a-z]/.test(password))           errors.push('password must contain a lower case letter');
  if (!/[A-Z]/.test(password))           errors.push('password must contain an upper case letter');
  if (!/[0-9]/.test(password))           errors.push('password must contain a number');
  if (!/[^A-Za-z0-9\s]/.test(password)) errors.push('password must contain a special character');

  if (optional.username && password.toLocaleLowerCase() === optional.username.toLocaleLowerCase())
    errors.push('password cannot be the same as the username');
  if (optional.currPassword !== undefined && password === optional.currPassword)
    errors.push('new password cannot be the same as the current password');

  return errors;
}