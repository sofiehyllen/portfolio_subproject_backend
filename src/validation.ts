// Request validation. Each validator returns the cleaned value, or throws
// BadRequest (400) listing every field that is missing or invalid.

import { BadRequest } from './middleware/errors.js';
import { SORT_FIELDS, SortField, TitleBrowse } from './data/titles.js';

export interface NewUserInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

// Only the fields that were sent; at least one is always present.
export interface UserUpdateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
}

// Field rules. The maximum lengths match the columns of the users table.
const NAME_MAX = 50;
const EMAIL_MAX = 256;
const USERNAME = /^[A-Za-z0-9_.-]{3,50}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequest('body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

// A required, non-blank text field, trimmed. Problems are added to errors.
function text(value: unknown, field: string, max: number | undefined, errors: string[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} is required`);
    return '';
  }
  if (max !== undefined && value.trim().length > max) errors.push(`${field} must be at most ${max} characters`);
  return value.trim();
}

// Lowercased, so the UNIQUE constraint also catches Foo@x.dk vs foo@x.dk
function email(value: unknown, errors: string[]): string {
  const result = text(value, 'email', EMAIL_MAX, errors).toLowerCase();
  if (result && !EMAIL.test(result)) errors.push('email is not a valid email address');
  return result;
}

// Body of POST /api/users.
export function validateNewUser(body: unknown): NewUserInput {
  const b = asObject(body);
  const errors: string[] = [];

  const firstName = text(b.firstName, 'firstName', NAME_MAX, errors);
  const lastName = text(b.lastName, 'lastName', NAME_MAX, errors);

  const username = text(b.username, 'username', undefined, errors).toLowerCase();
  if (username && !USERNAME.test(username)) {
    errors.push('username must be 3-50 characters: letters, digits, _ . -');
  }

  const mail = email(b.email, errors);

  // Not trimmed: spaces are allowed in passwords
  const password = b.password;
  if (typeof password !== 'string' || password === '') {
    errors.push('password is required');
  } else if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    errors.push(`password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
  }

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return { firstName, lastName, username, email: mail, password: password as string };
}

// Body of PATCH /api/users/{uconst}. Every field is optional, but a field
// that is sent must be valid, and at least one must be sent. The username
// cannot be changed, and the password has its own endpoint.
export function validateUserUpdate(body: unknown): UserUpdateInput {
  const b = asObject(body);
  const errors: string[] = [];

  for (const field of Object.keys(b)) {
    if (field === 'username') errors.push('username cannot be changed');
    else if (field === 'password') errors.push('password is changed with PUT /api/users/{uconst}/password');
    else if (!['firstName', 'lastName', 'email'].includes(field)) errors.push(`unknown field ${field}`);
  }

  const update: UserUpdateInput = {};
  if (b.firstName !== undefined) update.firstName = text(b.firstName, 'firstName', NAME_MAX, errors);
  if (b.lastName !== undefined) update.lastName = text(b.lastName, 'lastName', NAME_MAX, errors);
  if (b.email !== undefined) update.email = email(b.email, errors);

  if (errors.length === 0 && Object.keys(update).length === 0) {
    errors.push('send at least one of firstName, lastName, email');
  }

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return update;
}

const BROWSE_PARAMS = ['sort', 'order', 'genre', 'titleType'];
const TITLES_PARAMS = ['text', ...BROWSE_PARAMS, 'limit', 'offset'];
const FILTER_MAX = 100;

// Query of GET /api/titles, checked once before choosing search or browse:
// only its own parameters are accepted, so anything else (?keywords=..., a
// typo like ?sortt=year) gives 400 instead of being silently ignored.
export function rejectUnknownTitleParams(query: Record<string, unknown>): void {
  const unknown = Object.keys(query).filter(param => !TITLES_PARAMS.includes(param));
  if (unknown.length > 0) throw new BadRequest(`unknown query parameter ${unknown.join(', ')}`);
}

// Query of GET /api/titles without a search: sort, order, genre and titleType,
// all optional. The default is alphabetical by title. A parameter that is sent
// twice (?sort=a&sort=b) arrives as an array and is rejected.
export function validateTitleBrowse(query: Record<string, unknown>): TitleBrowse {
  const errors: string[] = [];

  const sort = query.sort ?? 'title';
  if (typeof sort !== 'string' || !(SORT_FIELDS as readonly string[]).includes(sort)) {
    errors.push(`sort must be one of ${SORT_FIELDS.join(', ')}`);
  }

  const order = query.order ?? 'asc';
  if (order !== 'asc' && order !== 'desc') errors.push('order must be asc or desc');

  const browse: TitleBrowse = { sort: sort as SortField, order: order as 'asc' | 'desc' };
  for (const field of ['genre', 'titleType'] as const) {
    const value = query[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim() === '' || value.trim().length > FILTER_MAX) {
      errors.push(`${field} must be 1-${FILTER_MAX} characters`);
    } else {
      browse[field] = value.trim();
    }
  }

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return browse;
}

const SEARCH_MAX = 100;

// Query of GET /api/titles?text=...: the search text, 1-100 characters after
// trimming, sent once. Sorting and filtering apply to browsing only, not to a
// search (one mode per request). Returns the trimmed text.
export function validateTitleSearch(query: Record<string, unknown>): string {
  const mixed = BROWSE_PARAMS.filter(param => query[param] !== undefined);
  if (mixed.length > 0) throw new BadRequest(`${mixed.join(', ')} cannot be combined with text`);

  const value = query.text;
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > SEARCH_MAX) {
    throw new BadRequest(`text must be 1-${SEARCH_MAX} characters`);
  }
  return value.trim();
}
