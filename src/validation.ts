// Validation of client input.
// Everything in req.body, req.query and req.params is untrusted and arrives as
// unknown or as strings. Each function here checks one kind of input and returns
// a typed value the data layer can rely on.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function pageOf(query: Record<string, unknown>): { limit: number; offset: number } {
  const asked = Number(query.limit ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;
  const from = Number(query.offset ?? 0);
  const offset = Number.isInteger(from) && from >= 0 ? from : 0;
  return { limit, offset };
}