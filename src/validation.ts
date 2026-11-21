/**
 * Request validation: cleans and type-narrows query and body input before it
 * reaches the services and the data layer.
 *
 * Most validators return the cleaned value or throw {@link BadRequest} (400)
 * listing every field error at once. Exceptions:
 * - `parseSort` pushes its errors to an array supplied by the caller.
 * - `validatePassword` returns its errors instead of throwing.
 * - `validateTconst`, `validateNconst` and `validateSerial` return `undefined`
 *   for an invalid value.
 *
 * Users:
 * - `validateNewUser(body)`        — validates `POST /api/users` body.
 * - `validateLogin(body)`          — validates `POST /api/auth` body.
 * - `validateUserUpdate(body)`     — validates `PATCH /api/users/:uconst` body.
 * - `validatePassword(password)`   — validates a password; returns error strings.
 * - `validatePasswordUpdate(body)` — validates `PUT /api/users/:uconst/password` body.
 * - `validateRating(body)`         — validates a numeric rating (1–10).
 *
 * Titles:
 * - `rejectUnknownTitleParams(query)` — throws 400 for unrecognised query params.
 * - `validateTitleBrowse(query)`      — validates browse/filter/sort params.
 * - `validateTitleSearch(query)`      — validates `?text=` search.
 * - `isStructuredSearch(query)`       — checks whether the query is a structured search.
 * - `validateStructuredSearch(query)` — validates structured search fields.
 * - `validateWords(value)`            — validates a keyword list (also used by structured search).
 * - `validateKeywordSearch(query)`    — validates `?keywords=` search.
 *
 * Persons:
 * - `validatePersonBrowse(query)` — validates person browse/filter/sort params.
 *
 * Identifiers:
 * - `validateTconst(tconst)` — returns a valid tconst or `undefined`.
 * - `validateNconst(nconst)` — returns a valid nconst or `undefined`.
 * - `validateSerial(value)`  — returns a valid integer id or `undefined`.
 */
import { BadRequest } from './middleware/errors.js';
import { KEYWORD_MATCHES, KeywordMatch, StructuredSearch, TITLE_SORT_FIELDS, TitleBrowse } from './data/titles.js';
import { PERSON_SORT_FIELDS, PersonBrowse } from "./data/persons.js";
import { Sort, SORT_ORDERS, SortOrder } from "./data/sorting.js";
import type { NewUserInput, PasswordUpdateInput, UserUpdateInput } from "./services/users.js";
import { LoginInput } from "./services/auth.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Maximum lenght of `firstName` and `lastName`*/
const NAME_MAX     = 50;
/** Maximum lenght of an email */
const EMAIL_MAX    = 256;
/** Minimum password lenght*/
const PASSWORD_MIN = 8;
/** Maximum password lenght*/
const PASSWORD_MAX = 128;
/**Allowed usernames: 3-50 letters, digits, `_`, `.` or `-` */
const USERNAME = /^[A-Za-z0-9_.-]{3,50}$/;
/** Loose email shape check: {}@{}.{}*/
const EMAIL    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Narrows `body` to a plain object.
 * @throws {BadRequest} If `body` is not a plain JSON object.
 */
function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequest('Body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

/**
 * Validates and trims a required string field.
 * @param errors Accumulated error list; failures are pushed here rather than thrown.
 * @returns The trimmed value, or an empty string when validation fails.
 */
function text(value: unknown, field: string, max: number | undefined, errors: string[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} is required`);
    return '';
  }
  if (max !== undefined && value.trim().length > max) errors.push(`${field} must be at most ${max} characters`);
  return value.trim();
}

/**
 * Validates, trims and lowercases an email field.
 * Lowercased so the UNIQUE constraint also catches `Foo@x.dk` vs `foo@x.dk`.
 * @param errors Accumulated error list; failures are pushed here rather than thrown.
 * @returns The trimmed, lowercased value, or an empty string when validation fails.
 */
function email(value: unknown, errors: string[]): string {
  const result = text(value, 'email', EMAIL_MAX, errors).toLowerCase();
  if (result && !EMAIL.test(result)) errors.push('email is not valid');
  return result;
}

/**
 * Parses `sort` and `order` query parameters against `fields`.
 * Falls back to `defaultField` / `'asc'` when not supplied.
 * @template F The union of valid sort field names.
 * @param errors Accumulated error list; invalid values are pushed here rather than thrown.
 */
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

// ── Users ─────────────────────────────────────────────────────────────────────

/**
 * Parses and validates the body of `POST /api/users`.
 * @throws {BadRequest} Listing every invalid field.
 */
export function validateNewUser(body: unknown): NewUserInput {
  const b = asObject(body);
  const errors: string[] = [];

  const firstName = text(b.firstName, 'firstName', NAME_MAX, errors);
  const lastName  = text(b.lastName,  'lastName',  NAME_MAX, errors);

  const username = text(b.username, 'username', undefined, errors).toLowerCase();
  if (username && !USERNAME.test(username)) {
    errors.push('username must be 3-50 characters: letters, digits, _ . -');
  }

  const mail     = email(b.email, errors);
  const password = b.password; // not trimmed: spaces are allowed in passwords
  errors.push(...validatePassword(password, { username }));

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return { firstName, lastName, username, email: mail, password: password as string };
}


/**
 * Parses and validates the body of `POST /api/auth/token` (login).
 * Only presence is checked: the password rules apply when a password is set, not at login.
 * @throws {BadRequest} Listing every missing field.
 */
export function validateLogin(body: unknown): LoginInput {
  const b = asObject(body);
  const errors: string[] = [];
  const username = text(b.username, 'username', undefined, errors).toLowerCase(); // stored in lower case
  const password = b.password; // not trimmed, as at registration
  if (typeof password !== 'string' || password === '') errors.push('password is required');

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return { username, password: password as string };
}


/**
 * Parses and validates the body of `PATCH /api/users/{uconst}`.
 * Every sent field must be valid; at least one must be present.
 * Username and password cannot be changed here.
 * @throws {BadRequest} Listing every invalid field, or if no field was sent.
 */
export function validateUserUpdate(body: unknown): UserUpdateInput {
  const b = asObject(body);
  const errors: string[] = [];

  for (const field of Object.keys(b)) {
    if (field === 'username')    errors.push('username cannot be changed');
    else if (field === 'password') errors.push('password is changed with PUT /api/users/{uconst}/password');
    else if (!['firstName', 'lastName', 'email'].includes(field)) errors.push(`Unknown field ${field}`);
  }

  const update: UserUpdateInput = {};
  if (b.firstName !== undefined) update.firstName = text(b.firstName, 'firstName', NAME_MAX, errors);
  if (b.lastName  !== undefined) update.lastName  = text(b.lastName,  'lastName',  NAME_MAX, errors);
  if (b.email     !== undefined) update.email     = email(b.email, errors);

  if (errors.length === 0 && Object.keys(update).length === 0) {
    errors.push('Send at least one of firstName, lastName, email');
  }

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return update;
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

/**
 * Parses the body of `PUT /api/users/{uconst}/password`.
 * @throws {BadRequest} If `currentPassword` or `newPassword` is missing or blank.
 */
export function validatePasswordUpdate(body: unknown): PasswordUpdateInput {
  const b = asObject(body);
  const { currentPassword, newPassword } = b;

  if (typeof currentPassword !== 'string' || currentPassword === '' ||
      typeof newPassword      !== 'string' || newPassword      === '') {
    throw new BadRequest('Current and new passwords are required');
  }

  return { currentPassword, newPassword };
}

/**
 * Parses the body of `PUT /api/users/{uconst}/ratings/{tconst}`.
 * @throws {BadRequest} If `rating` is not an integer between 1 and 10.
 */
export function validateRating(body: unknown): number {
  const rating = asObject(body).rating;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 10) {
    throw new BadRequest('rating must be an integer between 1 and 10');
  }
  return rating;
}

// ── Titles ────────────────────────────────────────────────────────────────────

/** Browse-mode parameters of `GET /api/titles` */
const BROWSE_PARAMS = ['sort', 'order', 'genre', 'titleType'];
/** Keyword-search parameters of `GET /api/titles` */
const KEYWORD_PARAMS = ['keywords', 'match'];
/** Structured-search parameters of `GET /api/titles` */
const STRUCTURED_PARAMS = ['title', 'plot', 'character', 'person'] as const;
/** Every parameter `GET /api/titles accepts`; anything else is rejected. */
const TITLES_PARAMS = ['text', ...KEYWORD_PARAMS, ...BROWSE_PARAMS, ...STRUCTURED_PARAMS, 'limit', 'offset'];
/** Maximum lenght of the `genre` and `titleType` filters*/
const FILTER_MAX    = 100;
/** Maximum lenght of a search text or a structured-search field*/
const SEARCH_MAX    = 100;
/** Maximum number of words in a comma-separated word list*/
const WORDS_MAX     = 10;
/** Maximum length of one word in a word list */
const WORD_MAX      = 50;

/**
 * Rejects query parameters not accepted by `GET /api/titles`.
 * Called once before choosing between search and browse mode.
 * @throws {BadRequest} If any unknown parameter is present.
 */
export function rejectUnknownTitleParams(query: Record<string, unknown>): void {
  const unknown = Object.keys(query).filter(param => !TITLES_PARAMS.includes(param));
  if (unknown.length > 0) throw new BadRequest(`unknown query parameter '${unknown.join(', ')}'`);
}

/**
 * Parses and validates the query of `GET /api/titles` (browse mode):
 * `sort`, `order`, `genre` and `titleType`, all optional.
 * Defaults to alphabetical by title. A parameter sent twice is rejected.
 * @throws {BadRequest} Listing every invalid field.
 */
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

/**
 * Parses and validates the `text` parameter of `GET /api/titles?text=...`.
 * @returns The trimmed search text.
 * @throws {BadRequest} If browse parameters are mixed in, or if `text` is blank or too long.
 */
export function validateTitleSearch(query: Record<string, unknown>): string {
  const mixed = [...KEYWORD_PARAMS, ...BROWSE_PARAMS, ...STRUCTURED_PARAMS].filter(param => query[param] !== undefined);
  if (mixed.length > 0) throw new BadRequest(`${mixed.join(', ')} cannot be combined with text`);

  const value = query.text;
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > SEARCH_MAX) {
    throw new BadRequest(`text must be 1-${SEARCH_MAX} characters`);
  }
  return value.trim();
}

/**
 * Checks whether a search is a regular string search or a structured string search.
 * @param query The raw Express `req.query` object.
 * @returns `true` when the query contains at least one of the structured search parameters
 * (`title`, `plot`, `character`, `person`).
 */
export function isStructuredSearch(query: Record<string, unknown>): boolean {
  return STRUCTURED_PARAMS.some(param => query[param] !== undefined);
}

/**
 * Parses and validates the structured search parameters of `GET /api/titles`:
 * `title`, `plot`, `character` and `person`, each at most 100 characters when sent.
 * Unsent fields default to `''`, which `structured_string_search` treats as "no filter".
 * At least one field must have text.
 * @returns The validated search with trimmed field values; unsent fields are `''`.
 * @throws {BadRequest} If browse/text parameters are mixed in, any field is invalid, or all fields are blank.
 */
export function validateStructuredSearch(query: Record<string, unknown>): StructuredSearch {
  const mixed = [...BROWSE_PARAMS, 'text'].filter(param => query[param] !== undefined);
  if (mixed.length > 0) {
    throw new BadRequest(`${mixed.join(', ')} cannot be combined with ${STRUCTURED_PARAMS.join(', ')}`);
  }
  
  const errors: string[] = [];
  const search: StructuredSearch = { title: '', plot: '', character: '', person: '' };
  for (const field of STRUCTURED_PARAMS) {
    const value = query[field];
    if (value === undefined) continue;
    // Sent twice (?plot=a&plot=b) arrives as an array
    if (typeof value !== 'string') {
      errors.push(`${field} must be sent once`);
    } else if (value.trim().length > SEARCH_MAX) {
      errors.push(`${field} must be at most ${SEARCH_MAX} characters`);
    } else {
      search[field] = value.trim(); // blank stays '' and is ignored
    }
  }

  if (errors.length === 0 && Object.values(search).every(value => value === '')) {
    errors.push(`at least one of ${STRUCTURED_PARAMS.join(', ')} must have text`);
  }

  if (errors.length > 0) throw new BadRequest(errors.join('; '));
  return search;
}

/**
 * Parses a comma-separated `words` query parameter: 1–10 words, each 1–50 characters.
 * A parameter sent twice (`?words=a&words=b`) arrives as an array and is rejected.
 * @throws {BadRequest} If `words` is missing, not a string, empty, or violates the count/length limits.
 */
export function validateWords(value: unknown, field = 'words'): string[] {
  if (value === undefined) throw new BadRequest(`${field} is required`);
  if (typeof value !== 'string') throw new BadRequest(`${field} must be one comma separated list`);

  const words = value.split(',').map(word => word.trim()).filter(word => word !== '');
  if (words.length === 0)                         throw new BadRequest(`${field} is required`);
  if (words.length > WORDS_MAX)                   throw new BadRequest(`${field} can have at most ${WORDS_MAX} words`);
  if (words.some(word => word.length > WORD_MAX)) throw new BadRequest(`each word can be at most ${WORD_MAX} characters`);
  return words;
}

/**
 * Validated keyword search of `GET /api/titles?keywords=...`
 * @property keywords     - 1-10 trimmed keywords
 * @property match        - how the keywords are combined: `all`, `any` or `weighted`
 */
export interface KeywordSearch {
  keywords: string[];
  match: KeywordMatch;
}

/**
 * Parses and validates the keyword search of `GET /api/titles?keywords=...&match=...`.
 * `keywords` follows {@link validateWords}; `match` is `all`, `any` or `weighted`
 * (default `weighted`). Sorting, filtering and structured-search parameters belong
 * to other modes and are rejected.
 *
 * @param query - The raw Express `req.query` object.
 * @returns The validated keywords and match mode.
 * @throws {BadRequest} If parameters from another mode are mixed in, `match` is
 *   invalid, or `keywords` is missing or breaks the count/length limits.
 */
export function validateKeywordSearch(query: Record<string, unknown>): KeywordSearch {
  const mixed = [...BROWSE_PARAMS, ...STRUCTURED_PARAMS].filter(param => query[param] !== undefined);
  if (mixed.length > 0) throw new BadRequest(`${mixed.join(', ')} cannot be combined with keywords`);

  const match = query.match ?? 'weighted';
  if (typeof match !== 'string' || !(KEYWORD_MATCHES as readonly string[]).includes(match)) {
    throw new BadRequest(`match must be one of ${KEYWORD_MATCHES.join(', ')}`);
  }

  return { keywords: validateWords(query.keywords, 'keywords'), match: match as KeywordMatch };
}

// ── Persons ───────────────────────────────────────────────────────────────────

/**Every parameter `GET /api/persons` accepts */
const PERSONS_PARAMS  = ['name', 'actorsOnly', 'sort', 'order', 'limit', 'offset'];
/** Maximum length of the `name` parameter of the `GET /api/persons` */
const PERSON_NAME_MAX = 100;

/**
 * Parses and validates the query of `GET /api/persons`:
 * `name` (1–100 chars), `actorsOnly` (true/false), `sort` (name/rating), `order` (asc/desc).
 * All parameters are optional, but `actorsOnly` requires `name`.
 * @throws {BadRequest} If any parameter is invalid or unknown.
 */
export function validatePersonBrowse(query: Record<string, unknown>): PersonBrowse {
  const unknown = Object.keys(query).filter(param => !PERSONS_PARAMS.includes(param)); // collect params not in the allowed list
  if (unknown.length > 0) throw new BadRequest(`unknown query parameter '${unknown.join(', ')}'`); // reject immediately — typo or wrong endpoint

  const errors: string[] = []; // collect all field errors before throwing, so the client sees them all at once

  let name: string | undefined; // undefined means "no name filter"; assigned below only when the param is present and valid
  if (query.name !== undefined) { // name is optional; skip the whole block when the client did not send it
    const value = query.name;
    if (typeof value !== 'string' || value.trim() === '' || value.trim().length > PERSON_NAME_MAX) { // blank strings and long names are invalid
      errors.push(`name must be 1-${PERSON_NAME_MAX} characters`);
    } else {
      name = value.trim(); // trim leading/trailing whitespace before passing to the query
    }
  }

  const flag = query.actorsOnly ?? 'false'; // default to 'false' when not sent; query params are always strings
  if (flag !== 'true' && flag !== 'false') errors.push('actorsOnly must be true or false'); // only the string literals 'true' and 'false' are accepted
  const actorsOnly = flag === 'true'; // convert the string to a boolean
  if (actorsOnly && query.name === undefined) errors.push('actorsOnly requires name'); // actor_search requires a name to narrow

  const sort = parseSort(query, PERSON_SORT_FIELDS, 'name', errors); // validate sort and order; errors are added to the shared array

  if (errors.length > 0) throw new BadRequest(errors.join('; ')); // throw once with all collected errors
  return { name, actorsOnly, ...sort }; // spread sort to include both the sort field and direction
}

/**
 * Validates an IMDB title identifier (tconst)
 * @param tconst - raw value to validate
 * @returns the same string if it is `tt` followed by 7-8 digits, otherwise `undefined`
 */
export function validateTconst(tconst: string): string | undefined {
  return /^tt\d{7,8}$/.test(tconst) ? tconst : undefined;
}

/**
 * Validates an IMDB person identifier (nconst)
 * @param nconst - raw value to validate
 * @returns the same string if it is `nm` followed by 7-8 digits, otherwise `undefined`
 */
export function validateNconst(nconst: string): string | undefined {
  return /^nm\d{7,8}$/.test(nconst) ? nconst : undefined;
}

/**
 * Validates a `SERIAL` key (gconst, pconst, uconst, sconst) and converts it to a number
 * @param value - raw value to validate
 * @returns the value as a number if it is a positive integer without a sign
 * or leading zeros and fits a Postgres `INT`, otherwise `undefined`
 */
export function validateSerial(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }

  const number = Number(value);
  return number <= 2147483647 ? number : undefined; // fits a Postgres integer
}