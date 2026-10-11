const PAGE = 1000;
/** Pages fetched concurrently per round; one round covers 8k rows. */
const CONCURRENCY = 8;

/**
 * Reads every row of a query page by page. PostgREST caps a response at 1000 rows,
 * so a plain select silently truncates large tables (agents, agent dimensions).
 * Pages are fetched in concurrent rounds instead of one at a time; the query must be ordered.
 */
export async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += PAGE * CONCURRENCY) {
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => {
        const from = start + i * PAGE;
        return page(from, from + PAGE - 1);
      })
    );
    for (const { data, error } of results) {
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) return rows;
    }
  }
}
