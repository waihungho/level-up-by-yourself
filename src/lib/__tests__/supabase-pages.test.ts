import { describe, it, expect } from "vitest";
import { selectAllPages } from "../supabase-pages";

describe("selectAllPages", () => {
  it("keeps requesting pages until a short page arrives", async () => {
    const table = Array.from({ length: 2500 }, (_, i) => i);
    const ranges: [number, number][] = [];
    const rows = await selectAllPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: table.slice(from, to + 1), error: null };
    });
    expect(rows).toEqual(table);
    // One concurrent round of 8 pages; rows past the short page are ignored.
    expect(ranges.slice(0, 3)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(ranges).toHaveLength(8);
  });

  it("starts another round when a full round comes back", async () => {
    const table = Array.from({ length: 8500 }, (_, i) => i);
    const rows = await selectAllPages(async (from, to) => ({ data: table.slice(from, to + 1), error: null }));
    expect(rows).toEqual(table);
  });

  it("throws the query error", async () => {
    await expect(selectAllPages(async () => ({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
