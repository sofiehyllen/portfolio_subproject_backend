/**
 * Cryptographic utilities: password hashing and JWT signing.
 *
 * Passwords are hashed with Node's built-in scrypt (no extra dependency).
 * Stored format: `scrypt$<salt>$<hash>`, both base64-encoded. The salt is
 * random per password, so two users with the same password get different hashes.
 *
 * JWTs are HS256-signed with JWT_SECRET and expire after 12 hours. The only
 * claim is `uconst` (the user's id).
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';

export interface Claims { uconst: number }

/** Token lifetime in seconds. Also used as the cookie's maxAge, so both expire together. */
export const TOKEN_TTL_SECONDS = 12 * 60 * 60;

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is not set');

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

// ─── Password hashing ────────────────────────────────────────────────────────

/**
 * Hashes a plaintext password with scrypt.
 *
 * @param password - The plaintext password to hash.
 * @returns The stored hash in `scrypt$<salt>$<hash>` format.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Checks a plaintext password against a stored hash.
 * Uses a timing-safe comparison so the result reveals no timing information.
 *
 * @param password - The plaintext password to verify.
 * @param stored   - The stored hash in `scrypt$<salt>$<hash>` format.
 * @returns `true` when the password matches, `false` otherwise.
 */
export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

/**
 * Signs a JWT containing the given claims.
 *
 * @param claims - The payload to encode (`uconst`).
 * @returns A signed HS256 JWT string valid for 12 hours.
 */
export function signToken(claims: Claims): string {
  return jwt.sign(claims, SECRET!, { algorithm: 'HS256', expiresIn: TOKEN_TTL_SECONDS });
}

/**
 * Verifies a JWT and returns its decoded claims if valid.
 *
 * @param token - The JWT string to verify.
 * @returns The decoded {@link Claims}, or `undefined` when the signature is
 *   wrong, the token has expired, or the payload has the wrong shape.
 */
export function verifyToken(token: string): Claims | undefined {
  try {
    const payload = jwt.verify(token, SECRET!, { algorithms: ['HS256'] });
    if (typeof payload === 'object' && typeof payload.uconst === 'number') {
      return { uconst: payload.uconst };
    }
  } catch { /* invalid or expired */ }
  return undefined;
}
