/**
 * Sorting shared by the lists the client may sort (titles and persons).
 *
 * Each list keeps its own whitelist of sort fields and maps every field to a
 * column. Only those column strings ever reach ORDER BY, so no client value is
 * assembled into SQL.
 *
 * Exports:
 * - `SORT_ORDERS` / `SortOrder` — the allowed sort directions: 'asc' | 'desc'.
 * - `Sort<F>` — a validated sort: one of the list's fields (F) and a direction.
 * - `orderBy(column, order, tieBreaker)` — builds an ORDER BY clause for a whitelisted column.
 */

export const SORT_ORDERS = ['asc', 'desc'] as const; // The allowed sort directions, available at runtime for validation
/** Type: 'asc' | 'desc', derived from {@link SORT_ORDERS} and checked at compile time */
export type SortOrder = typeof SORT_ORDERS[number]; 

/**
 * A validated sort: one of the list's fields (F) and a direction.
 * @template F      - the list's allowed field names
 * @property sort   - the field to sort by
 * @property order  - the sort direction
 */
export interface Sort<F extends string> {
  sort: F;
  order: SortOrder;
}


/**
 * The ORDER BY clause for a whitelisted column. Rows without a value come last
 * in both directions, and the tie-breaker makes the order total, so pages
 * never overlap or skip rows.
 * @param column        - a column from the list's whitelist, never a client value
 * @param order         - the sort direction
 * @param tieBreaker    - columns appended to make the order unique
 * @returns               the clause
 */
export function orderBy(column: string, order: SortOrder, tieBreaker: string): string {
  const direction = order === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${direction} NULLS LAST, ${tieBreaker}`;
}