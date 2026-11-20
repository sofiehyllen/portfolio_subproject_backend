/**
 * Generic paging utilities used by all list endpoints.
 *
 * Exports two interfaces and three functions:
 * - `Page` — the validated limit/offset pair derived from the query string from the client.
 * - `Paged<T>` — the response structure sent to the client.
 * - `pageOf(query)` — parses and validates limit/offset from the raw query string, falling back to safe defaults.
 * - `paged(req, page, total, items)` — assembles a `Paged<T>` response, including prev/next URLs.
 * - `searchLogUser(page, uconst)` — the user to log a search under: the caller on the first
 *   page, otherwise null, so later pages and anonymous requests are not logged.
 *
 * Internal:
 * - `linkTo` — builds a URL for the same endpoint at a different offset, preserving all other query params.
 */
import { Request } from 'express';

/** Page size when the client sends no valid `limit`. */
const DEFAULT_LIMIT = 20;
/** Largest `limit` a client may ask for. */
const MAX_LIMIT = 100;

/**
 * The page the client asked for, after {@link pageOf} has cleaned the input.
 * @property limit  - How many items to return.
 * @property offset - How many items to skip from the beginning.
 */
export interface Page {
  limit: number;   // how many items to return
  offset: number;  // how many items to skip from the beginning
}

/**
 * The response body of every list endpoint.
 * @template T - The item type.
 * @property total  - Number of items across all pages.
 * @property limit  - Page size used.
 * @property offset - Number of items skipped before this page.
 * @property items  - The items on this page.
 * @property links  - URLs of the previous and next page; `null` at either end.
 */
export interface Paged<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
  links: { prev: string | null; next: string | null };
}

/**
 * Reads `limit` and `offset` from the query string. Invalid values give no
 * error: `limit` falls back to 20 unless it is an integer from 1 to 100, and
 * `offset` falls back to 0 unless it is a non-negative integer.
 *
 * @param query - The raw Express `req.query` object.
 * @returns The cleaned page.
 */
export function pageOf(query: Record<string, unknown>): Page {
  const asked = Number(query.limit ?? DEFAULT_LIMIT); // use the client's limit, or the default if absent
  const limit = Number.isInteger(asked) && asked > 0 && asked <= MAX_LIMIT
    ? asked          // accept the value if it is a positive integer within the allowed range
    : DEFAULT_LIMIT; // reject anything invalid and fall back to the default
  const from = Number(query.offset ?? 0); // use the client's offset, or 0 if absent
  const offset = Number.isInteger(from) && from >= 0 ? from : 0; // reject negative or non-integer offsets
  return { limit, offset };
}

/**
 * Builds the URL of the same endpoint, with the same query parameters, at
 * another page. A parameter sent more than once (an array) is not copied.
 *
 * @param req    - The current request.
 * @param limit  - Page size of the target page.
 * @param offset - Offset of the target page.
 * @returns A path with query string, e.g. `/api/titles?genre=Drama&limit=20&offset=40`.
 */
function linkTo(req: Request, limit: number, offset: number): string {
  const params = new URLSearchParams(); // query builder
  for (const [key, value] of Object.entries(req.query)) { // copy every existing query param from the request
    if (typeof value === 'string') {
      params.set(key, value); // only copy simple string values, not arrays
    }
  }
  params.set('limit', String(limit));    // override with the target page's limit
  params.set('offset', String(offset));  // override with the target page's offset
  const path = req.path === '/' ? '' : req.path; // avoid a trailing slash: /titles, not /titles/
  return `${req.baseUrl}${path}?${params}`;      // combine base URL, path, and query string
}

/**
 * Builds the paged response for a list endpoint, including prev/next links.
 * `T` is inferred from `items`: passing `TitleDto[]` gives `Paged<TitleDto>`.
 *
 * @template T - The item type.
 * @param req   - The current request, used to build the links.
 * @param page  - The validated page.
 * @param total - Number of items across all pages.
 * @param items - The items on this page.
 * @returns The response body.
 */
export function paged<T>(req: Request, page: Page, total: number, items: T[]): Paged<T> {
  const { limit, offset } = page;
  const prev = offset > 0 // a previous page exists when this one does not start at the beginning
    ? linkTo(req, limit, Math.max(0, offset - limit)) // clamp to 0 so prev never goes negative
    : null;
  const next = offset + limit < total // a next page exists when there are items after the end of this one
    ? linkTo(req, limit, offset + limit)
    : null;
  return { total, limit, offset, items, links: { prev, next } };
}

/**
 * Decides whether a search is logged, and under which user. Only the first page
 * is logged, since later pages repeat the same search; anonymous requests are
 * never logged.
 *
 * @param page   - The validated page.
 * @param uconst - Id of the logged-in user, or `undefined` when anonymous.
 * @returns The user id to log under, or `null` to skip logging.
 */
export function searchLogUser(page: Page, uconst: number | undefined): number | null {
  return page.offset === 0 && uconst !== undefined ? uconst : null;
}