// Request validation. Each validator returns the cleaned value, or throws
// BadRequest (400) listing every field that is missing or invalid.

import { BadRequest } from './middleware/errors.js';
import { TITLE_SORT_FIELDS, TitleBrowse } from './data/titles.js';
import { PERSON_SORT_FIELDS, PersonBrowse } from "./data/persons.js";
import { Sort, SORT_ORDERS, SortOrder } from "./data/sorting.js";

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

export interface PasswordUpdateInput {
  currentPassword: string;
  newPassword: string;
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
    throw new BadRequest('Body must be a JSON object');
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
  if (result && !EMAIL.test(result)) errors.push('email is not a valid');
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
  errors.push(...validatePassword(password, { username }));

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
    else if (!['firstName', 'lastName', 'email'].includes(field)) errors.push(`Unknown field ${field}`);
  }

  const update: UserUpdateInput = {};
  if (b.firstName !== undefined) update.firstName = text(b.firstName, 'firstName', NAME_MAX, errors);
  if (b.lastName !== undefined) update.lastName = text(b.lastName, 'lastName', NAME_MAX, errors);
  if (b.email !== undefined) update.email = email(b.email, errors);

  if (errors.length === 0 && Object.keys(update).length === 0) {
    errors.push('Send at least one of firstName, lastName, email');
  }

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return update;
}

export function validatePassword(password: unknown, optional: {username?: string, currPassword?: string} = {}): string[] {
  if (typeof password !== 'string' || password === '') {
    return ['password is required'];
  }

  const errors: string[] = [];
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX ) {
    errors.push(`password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);      
  }

  if (!/[a-z]/.test(password)) {
    errors.push('password must contain a lower case letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('password must contain an upper case letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('password must contain a number');
  }

  if (!/[^A-Za-z0-9\s]/.test(password)) {
    errors.push('password must contain a special character');
  }

  if (optional.username && password.toLocaleLowerCase() === optional.username.toLocaleLowerCase()) {
    errors.push('password cannot be the same as the username');
  }

  if (optional.currPassword !== undefined && password === optional.currPassword) {
    errors.push('new password cannot be the same as the current password');
  }

  return errors;
}

export function validatePasswordUpdate(body: unknown): PasswordUpdateInput {
  const b = asObject(body);
  const currentPassword = b.currentPassword;
  const newPassword = b.newPassword;

  if (currentPassword === '' || newPassword === '' ||
      typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        throw new BadRequest('Current and new passwords are required');
  }

  return {
    currentPassword,
    newPassword
  };
}

// sort and order of a list the client may sort: sort must be one of the list's
// fields (default defaultField), order asc or desc (default asc). Errors are
// added to errors, so they are reported together with the list's other errors.
export function parseSort<F extends string>(
query: Record<string, unknown>, fields: readonly F[], defaultField: F, errors: string[],
): Sort<F> {
  const sort = query.sort ?? defaultField;
  if (typeof sort !== 'string' || !(fields as readonly string[]).includes(sort)) {
    errors.push(`sort must be one of ${fields.join(', ')}`);
  }

  const order = query.order ?? 'asc';
  if (typeof order !== 'string' || !(SORT_ORDERS as readonly string[]).includes(order)) {
    errors.push(`order must be one of ${SORT_ORDERS.join(', ')}`);
  }

  return { sort: sort as F, order: order as SortOrder };
}

const BROWSE_PARAMS = ['sort', 'order', 'genre', 'titleType'];
const TITLES_PARAMS = ['text', ...BROWSE_PARAMS, 'limit', 'offset'];
const FILTER_MAX = 100;

// Query of GET /api/titles, checked once before choosing search or browse:
// only its own parameters are accepted, so anything else (?keywords=..., a
// typo like ?sortt=year) gives 400 instead of being silently ignored.
export function rejectUnknownTitleParams(query: Record<string, unknown>): void {
  const unknown = Object.keys(query).filter(param => !TITLES_PARAMS.includes(param));
  if (unknown.length > 0) throw new BadRequest(`unknown query parameter '${unknown.join(', ')}'`);
}

// Query of GET /api/titles without a search: sort, order, genre and titleType,
// all optional. The default is alphabetical by title. A parameter that is sent
// twice (?sort=a&sort=b) arrives as an array and is rejected.
export function validateTitleBrowse(query: Record<string, unknown>): TitleBrowse {
  const errors: string[] = [];

  const browse: TitleBrowse = parseSort(query, TITLE_SORT_FIELDS, 'title', errors); // validate sort and order; errors are added to the shared array
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

const WORDS_MAX = 10;
const WORD_MAX = 50;

// The words query parameter: comma separated, 1-10 words, each 1-50 characters.
// A parameter that is sent twice (?words=a&words=b) arrives as an array and is rejected.
export function validateWords(value: unknown): string[] {
  if (value === undefined) throw new BadRequest('words is required');
  if (typeof value !== 'string') throw new BadRequest('words must be one comma separated list');

  const words = value.split(',').map(word => word.trim()).filter(word => word !== '');
  if (words.length === 0) throw new BadRequest('words is required');
  if (words.length > WORDS_MAX) throw new BadRequest(`words can have at most ${WORDS_MAX} words`);
  if (words.some(word => word.length > WORD_MAX)) {
    throw new BadRequest(`each word can be at most ${WORD_MAX} characters`);
  }
  return words;
}

const PERSONS_PARAMS = ['name', 'actorsOnly', 'sort', 'order', 'limit', 'offset'];
const PERSON_NAME_MAX = 100;

// Query of GET /api/persons: 
//    name (1-100 characters after trimming)
//    actorsOnly (true or false, default false)
//    sort (name or rating, default name)
//    order (asc or desc, default asc)
// All parameters are optional. 
// Unknown parameters give 400, as on GET /api/titles.
export function validatePersonBrowse(query: Record<string, unknown>): PersonBrowse {
  const unknown = Object.keys(query).filter(param => !PERSONS_PARAMS.includes(param)); // collect params not in the allowed list
  if (unknown.length > 0) throw new BadRequest(`unknown query parameter '${unknown.join(', ')}'`); // reject immediately — typo or wrong endpoint

  const errors: string[] = []; // collect all field errors before throwing, so the client sees them all at once

  let name: string | undefined;
  if (query.name !== undefined) { // name is optional; skip the whole block when the client did not send it
    const value = query.name;
    if (typeof value !== 'string' || value.trim() === '' || value.trim().length > PERSON_NAME_MAX) { // blank strings and over-long names are invalid
      errors.push(`name must be 1-${PERSON_NAME_MAX} characters`); // add to errors
    } else {
      name = value.trim(); // trim leading/trailing whitespace
    }
  }

  const flag = query.actorsOnly ?? 'false'; // default to 'false' when not sent
  if (flag !== 'true' && flag !== 'false') errors.push('actorsOnly must be true or false');
  const actorsOnly = flag === 'true'; // convert the string to a boolean
  if (actorsOnly && query.name === undefined) errors.push('actorsOnly requires name');

  const sort = parseSort(query, PERSON_SORT_FIELDS, 'name', errors); // validate sort and order; errors are added to the shared array

  if (errors.length > 0) throw new BadRequest(errors.join('; ')); // throw once with all collected errors
  return { name, actorsOnly, ...sort }; // spread sort to include both the sort field and direction
}