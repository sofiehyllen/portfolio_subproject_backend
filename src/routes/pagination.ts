/**
 * Generic paging utilities used by all list endpoints.
 *
 * Exports two interfaces and three functions:
 * - `Page` — the validated limit/offset pair derived from the query string from the client.
 * - `Paged<T>` — the response structure sent to the client.
 * - `pageOf(query)` — parses and validates limit/offset from the raw query string, falling back to safe defaults.
 * - `paged(req, page, total, items)` — assembles a `Paged<T>` response, including prev/next URLs.
 * - `linkTo` (internal) — builds a URL for the same endpoint at a different offset, preserving all other query params.
 */
import { Request } from 'express';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// The structure of the page the client asked for, after pageOf has cleaned the input.
export interface Page {
  limit: number;   // how many items to return
  offset: number;  // how many items to skip from the beginning
}

// The structure of the response that is sent to the client
export interface Paged<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
  links: { prev: string | null; next: string | null };
}

// Reads limit and offset from the query string, falling back to defaults.
export function pageOf(query: Record<string, unknown>): Page {
  const asked = Number(query.limit ?? DEFAULT_LIMIT); // use the client's limit, or the default if absent
  const limit = Number.isInteger(asked) && asked > 0 && asked <= MAX_LIMIT
    ? asked          // accept the value if it is a positive integer within the allowed range
    : DEFAULT_LIMIT; // reject anything invalid and fall back to the default
  const from = Number(query.offset ?? 0); // use the client's offset, or 0 if absent
  const offset = Number.isInteger(from) && from >= 0 ? from : 0; // reject negative or non-integer offsets
  return { limit, offset };
}

// The URL of this same endpoint, with the same filters, at another page.
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

// Builds the paged response from the validated page, the total item count, and the items on this page.
// T is inferred from items: passing TitleDto[] makes the result Paged<TitleDto>.
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

// Logging of a users search: only on the first page, since later pages
// repeat the same search. Anonymous requests are never logged.
export function searchLogUser(page: Page, uconst: number | undefined): number | null {
  return page.offset === 0 && uconst !== undefined ? uconst : null;
}