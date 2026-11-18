/**
 * Read complete PostgREST result sets instead of silently dropping rows past
 * the server's per-response limit. An explicit hard limit rejects extremely
 * large requests rather than pretending the partial result is complete.
 */
export async function collectPages<T>(
  fetchRange: (from: number, to: number) => Promise<T[]>,
  pageSize = 500,
  maxRows = 50_000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error("INVALID_PAGE_SIZE");
  }
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchRange(offset, offset + pageSize - 1);
    if (page.length > pageSize) throw new Error("INVALID_PAGE_RESPONSE");
    rows.push(...page);
    if (rows.length > maxRows) throw new Error("MEAL_WINDOW_TOO_LARGE");
    if (page.length < pageSize) return rows;
  }
}
