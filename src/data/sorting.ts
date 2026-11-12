/**
 * Sorting shared by the lists the client may sort (titles and persons).
 *
 * Each list keeps its own whitelist of sort fields and maps every field to a
 * column. Only those column strings ever reach ORDER BY, so no client value is
 * assembled into SQL.
 */

export const SORT_ORDERS = ['asc', 'desc'] as const; // The allowed sort directions, available at runtime for validation
export type SortOrder = typeof SORT_ORDERS[number]; // Type: 'asc' | 'desc', derived from SORT_ORDERS and checked at compile time

// A validated sort: one of the list's fields (F) and a direction.
export interface Sort<F extends string> {
  sort: F;
  order: SortOrder;
}

// The ORDER BY clause for a whitelisted column. Rows without a value come last
// in both directions, and the tie-breaker makes the order total, so pages
// never overlap or skip rows.
export function orderBy(column: string, order: SortOrder, tieBreaker: string): string {
  const direction = order === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${direction} NULLS LAST, ${tieBreaker}`;
}