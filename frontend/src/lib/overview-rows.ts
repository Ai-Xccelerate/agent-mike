/**
 * Which rows of a long list a card shows. A service desk can list a dozen request types of which two have tickets;
 * showing every one makes the card tower over its neighbour and buries the two that matter. So the ones with a count
 * come first, biggest first, topped up with the desk's own order to a minimum so a quiet period still looks like the
 * desk, and the rest sit behind "Show all".
 */
export type CountRow = { name: string; count: number };

export const DEFAULT_ROW_LIMIT = 6;

export function visibleRows(rows: CountRow[], limit: number, expanded: boolean): { shown: CountRow[]; hidden: number } {
  if (expanded || rows.length <= limit) return { shown: rows, hidden: 0 };
  // Stable: rows with the same count keep the desk's order.
  const withCounts = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.count > 0);
  withCounts.sort((a, b) => b.row.count - a.row.count || a.index - b.index);
  const chosen = withCounts.slice(0, limit).map(({ row }) => row);
  // Top up with the zero rows, in the desk's own order, until there are `limit` rows.
  for (const row of rows) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(row)) chosen.push(row);
  }
  return { shown: chosen, hidden: rows.length - chosen.length };
}
