import { Request } from 'express';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// The structure of the page the client asked for, after pageOf has cleaned the input.
export interface Page {
  limit: number;
  offset: number;
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
  const asked = Number(query.limit ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(asked) && asked > 0 && asked <= MAX_LIMIT
    ? asked
    : DEFAULT_LIMIT;
  const from = Number(query.offset ?? 0);
  const offset = Number.isInteger(from) && from >= 0 ? from : 0;
  return { limit, offset };
}

//The URL of this same endpoint, with the same filters, at another page.
function linkTo(req: Request, limit: number, offset: number): string {
  const params = new URLSearchParams(); // query builder
  for (const [key, value] of Object.entries(req.query)) { // turns an object into [key, value] pairs
    if (typeof value === 'string') {
      params.set(key, value);   // copies params into the new query string
    }
  }
  params.set('limit', String(limit)); // limit and offset is overritten with the values for the correct page
  params.set('offset', String(offset));
  const path = req.path === '/' ? '' : req.path;   // avoid a trailing slash: /titles, not /titles/
  return `${req.baseUrl}${path}?${params}`;
}

// Builds the response from a Page, the total and the items on the page.
// T is inferred from items: passing TitleDto[] makes the result Paged<TitleDto>.
export function paged<T>(req: Request, page: Page, total: number, items: T[]): Paged<T> {
  const { limit, offset } = page;
  // A previous page exists when this one does not start at the beginning.
  const prev = offset > 0 ? linkTo(req, limit, Math.max(0, offset - limit)) : null;
  // A next page exists when there are items after the end of this one.
  const next = offset + limit < total ? linkTo(req, limit, offset + limit) : null;
  return { total, limit, offset, items, links: { prev, next } };
}
