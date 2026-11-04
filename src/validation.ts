// Request validation. Each validator returns the cleaned value, or throws
// BadRequest (400) listing every field that is missing or invalid.

import { BadRequest } from './middleware/errors.js';

export interface NewUserInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

const USERNAME = /^[A-Za-z0-9_.-]{3,50}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

// Body of POST /api/users. Lengths match the columns of the users table.
export function validateNewUser(body: unknown): NewUserInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequest('body must be a JSON object');
  }
  const b = body as Record<string, unknown>;
  const errors: string[] = [];

  const text = (field: string, max: number): string => {
    const value = b[field];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${field} is required`);
      return '';
    }
    if (value.trim().length > max) errors.push(`${field} must be at most ${max} characters`);
    return value.trim();
  };

  const firstName = text('firstName', 50);
  const lastName = text('lastName', 50);

  const username = text('username', 50);
  if (username && !USERNAME.test(username)) {
    errors.push('username must be 3-50 characters: letters, digits, _ . -');
  }

  // Lowercased, so the UNIQUE constraint also catches Foo@x.dk vs foo@x.dk
  const email = text('email', 256).toLowerCase();
  if (email && !EMAIL.test(email)) errors.push('email is not a valid email address');

  // Not trimmed: spaces are allowed in passwords
  const password = b.password;
  if (typeof password !== 'string' || password === '') {
    errors.push('password is required');
  } else if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    errors.push(`password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
  }

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return { firstName, lastName, username, email, password: password as string };
}
