// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-library's `searches` fan-out.
 *
 * Everything here had only mocked-runSearch unit coverage: the per-query
 * filters, the label grouping and its `#2` collision suffixes, the query cap,
 * and the `dbAvailable` roll-up across queries.
 *
 * Library.db contents vary by machine, so the assertions lean on Live's Core
 * Library (every install has it; the queries below match names in it) and on
 * the parts we control — labels, entry order, entry count — rather than on
 * which items come back.
 *
 * It also covers search paging (`more`, `nextOffset`, `offset`).
 *
 * Run with: npm run e2e:mcp -- ppal-library-searches
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

/** The fan-out's hard cap, mirrored from MAX_BATCH_QUERIES. */
const MAX_QUERIES = 20;

/** One query in a `searches` fan-out. */
type BatchQuery = Record<string, string | number | boolean>;

/** One group of results in a fan-out response. */
interface BatchEntry {
  label: string;
  items: Array<{ path: string; source?: string | null }>;
  more?: number;
  nextOffset?: number;
  detail?: string;
}

/** The fan-out response envelope. */
interface BatchResult {
  dbAvailable?: boolean;
  results: BatchEntry[];
}

describe("ppal-library searches", () => {
  /**
   * Run a fan-out and parse the envelope.
   * @param searches - The per-query filter sets
   * @returns The parsed batch result
   */
  async function batch(searches: BatchQuery[]): Promise<BatchResult> {
    return parseToolResult<BatchResult>(
      await ctx.client!.callTool({
        name: "ppal-library",
        arguments: { searches },
      }),
    );
  }

  /**
   * The item file names in one group (read off their paths), sorted so order
   * within a group can't flake.
   * @param entry - The group to read
   * @returns Sorted item names
   */
  function names(entry: BatchEntry | undefined): string[] {
    return (entry?.items ?? [])
      .map((item) => item.path.split("/").at(-1) ?? "")
      .toSorted();
  }

  /**
   * Whether every item's file name contains the text, case-insensitively: how a
   * `query` matches.
   * @param entry - The group to read
   * @param text - The query it was searched with
   * @returns True when the group is non-empty and every name matches
   */
  function allMatch(entry: BatchEntry | undefined, text: string): boolean {
    const found = names(entry);

    return (
      found.length > 0 &&
      found.every((name) => name.toLowerCase().includes(text))
    );
  }

  it("refuses top-level filters beside searches", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-library",
      arguments: {
        searches: [{ label: "Kicks", query: "kick" }],
        query: "snare",
      },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toBe(
      "Error: query can't be sent beside searches: each entry of searches takes its own filters. Put them in the entries, or drop searches.",
    );
  });

  it("applies each query's filters to its own group", async () => {
    const result = await batch([
      { label: "Kicks", source: "builtin", query: "kick", limit: 5 },
      { label: "Snares", source: "builtin", query: "snare", limit: 5 },
    ]);

    expect(result.results.map((entry) => entry.label)).toStrictEqual([
      "Kicks",
      "Snares",
    ]);
    // Each group holds only its own query's matches, or the filters aren't
    // being applied per query.
    expect(allMatch(result.results[0], "kick")).toBe(true);
    expect(allMatch(result.results[1], "snare")).toBe(true);
  });

  it("reports dbAvailable for the batch", async () => {
    const result = await batch([
      { source: "builtin", query: "kick", limit: 1 },
      { source: "builtin", query: "snare", limit: 1 },
    ]);

    expect(result.dbAvailable).toBe(true);
  });

  it("labels an unlabeled query by its index, and suffixes collisions", async () => {
    const result = await batch([
      { label: "Hits", source: "builtin", query: "kick", limit: 3 },
      { label: "Hits", source: "builtin", query: "snare", limit: 3 },
      { source: "builtin", query: "clap", limit: 3 },
    ]);

    // Every group stays addressable: the first "Hits" keeps the bare label,
    // the second takes #2, and the unlabeled query falls back to its index.
    expect(result.results.map((entry) => entry.label)).toStrictEqual([
      "Hits",
      "Hits#2",
      "2",
    ]);
    expect(allMatch(result.results[1], "snare")).toBe(true);
  });

  it("keeps a group for a query that matched nothing", async () => {
    const result = await batch([
      { label: "Nothing", source: "builtin", query: "zqxjvwkpqz" },
      { label: "Kicks", source: "builtin", query: "kick", limit: 3 },
    ]);

    // A dropped empty group would silently shift every later label's meaning.
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.items).toStrictEqual([]);
    expect(allMatch(result.results[1], "kick")).toBe(true);
  });

  it("answers a lone search ungrouped, the way a plain search does", async () => {
    const result = parseToolResult<BatchEntry & BatchResult>(
      await ctx.client!.callTool({
        name: "ppal-library",
        arguments: {
          searches: [
            { label: "Kicks", source: "builtin", query: "kick", limit: 3 },
          ],
        },
      }),
    );

    // Nothing to group, so no results array and no label to group under.
    expect(result).not.toHaveProperty("results");
    expect(result).not.toHaveProperty("label");
    expect(allMatch(result, "kick")).toBe(true);
  });

  it("refuses an empty searches", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-library",
      arguments: { searches: [] },
    });

    expect(getToolErrorMessage(result)).toContain(
      "searches must name at least one search",
    );
  });

  it("truncates past the query cap and warns", async () => {
    const searches = Array.from({ length: MAX_QUERIES + 1 }, (_, i) => ({
      label: `q${i}`,
      source: "builtin",
      query: "kick",
      limit: 1,
    }));
    const { data, warnings } = parseToolResultWithWarnings<BatchResult>(
      await ctx.client!.callTool({
        name: "ppal-library",
        arguments: { searches },
      }),
    );

    expect(data.results).toHaveLength(MAX_QUERIES);
    expect(data.results.at(-1)?.label).toBe(`q${MAX_QUERIES - 1}`);
    expect(warnings.join("\n")).toContain(
      `${MAX_QUERIES + 1} queries exceeds cap of ${MAX_QUERIES}`,
    );
  });

  describe("paging", () => {
    /**
     * Run a plain search and parse it.
     * @param args - The search args
     * @returns The parsed result
     */
    async function search(
      args: Record<string, string | number>,
    ): Promise<BatchEntry> {
      return parseToolResult<BatchEntry>(
        await ctx.client!.callTool({ name: "ppal-library", arguments: args }),
      );
    }

    // Every paging case below searches the Core Library's claps: about 120-150
    // in Live 12 and 13, so one page holds them all. Kicks are 400+.
    const CLAPS = { source: "builtin", query: "clap" } as const;

    it("reports what lies beyond a cut-off search, and leaves the fields off when nothing does", async ({
      skip,
    }) => {
      const cut = await search({ ...CLAPS, limit: 1 });

      expect(cut.items).toHaveLength(1);
      expect(cut.more).toBeGreaterThanOrEqual(1);
      expect(cut.nextOffset).toBe(1);

      const total = (cut.more ?? 0) + 1;

      skip(total > 200, "more claps than one page can hold");

      const whole = await search({ ...CLAPS, limit: total });

      expect(whole.items).toHaveLength(total);
      expect(whole).not.toHaveProperty("more");
      expect(whole).not.toHaveProperty("nextOffset");
    });

    it("walks the pages from nextOffset to the end: no repeats, full pages, no marker on the last", async ({
      skip,
    }) => {
      const probe = await search({ ...CLAPS, limit: 1 });
      const total = (probe.more ?? 0) + 1;

      skip(total < 3 || total > 200, "needs 3 to 200 claps to page through");

      const limit = Math.ceil(total / 3);
      const paths: string[] = [];
      let page = await search({ ...CLAPS, limit });

      paths.push(...page.items.map((item) => item.path));

      for (let i = 0; i < 10 && page.nextOffset != null; i++) {
        expect(page.items).toHaveLength(limit);

        page = await search({ ...CLAPS, limit, offset: page.nextOffset });
        paths.push(...page.items.map((item) => item.path));
      }

      expect(page).not.toHaveProperty("more");
      expect(page).not.toHaveProperty("nextOffset");
      expect(page.items.length).toBeGreaterThan(0);
      expect(new Set(paths).size).toBe(paths.length);
      expect(paths).toHaveLength(total);
    });

    it("says so when the offset is past the last match", async () => {
      const result = await search({ ...CLAPS, offset: 100_000 });

      expect(result.items).toStrictEqual([]);
      expect(result.detail).toBe("offset 100000 is past the last match");
    });

    it("takes a limit below 1 as the default, not a page of 0", async () => {
      const result = await search({ ...CLAPS, limit: 0.5 });

      expect(result.items.length).toBeGreaterThan(1);
    });

    it("answers an offset too big for SQLite as past the last match", async () => {
      const result = parseToolResult<BatchEntry & { dbAvailable?: boolean }>(
        await ctx.client!.callTool({
          name: "ppal-library",
          arguments: { source: "builtin", offset: 1e19 },
        }),
      );

      expect(result.dbAvailable).toBe(true);
      expect(result.items).toStrictEqual([]);
    });

    it("pages each searches entry on its own", async () => {
      const result = await batch([
        { label: "First", ...CLAPS, limit: 1 },
        { label: "Second", ...CLAPS, limit: 1, offset: 1 },
      ]);

      expect(result.results[0]?.items).toHaveLength(1);
      expect(result.results[0]).toStrictEqual(
        expect.objectContaining({ more: expect.any(Number), nextOffset: 1 }),
      );
      expect(result.results[1]?.items).toHaveLength(1);
      expect(names(result.results[1])).not.toStrictEqual(
        names(result.results[0]),
      );
    });

    it("refuses offset beside searches", async () => {
      const result = await ctx.client!.callTool({
        name: "ppal-library",
        arguments: { searches: [{ query: "kick" }], offset: 1 },
      });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain(
        "offset can't be sent beside searches",
      );
    });
  });
});
