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
 * Library.db contents vary by machine, so the assertions lean on the repo's own
 * sample folder (deterministic) and on the parts we control — labels, entry
 * order, entry count — rather than on which items come back.
 *
 * It also covers search paging (`more`, `nextOffset`, `offset`), here because
 * the sample folder gives a result set we control.
 *
 * Run with: npm run e2e:mcp -- ppal-library-searches
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  setConfig,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_FOLDER = resolve(__dirname, "../../../../evals/live-sets/samples");

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
  /** Present only when at least one query consulted the DB. */
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
    // The repo's own sample folder holds exactly kick.aiff and sample.aiff, so
    // these two queries have to come back with different items or the filters
    // aren't being applied per query.
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const result = await batch([
      { label: "Kicks", source: "sample-folder", query: "kick" },
      { label: "Everything", source: "sample-folder" },
    ]);

    expect(result.results.map((entry) => entry.label)).toStrictEqual([
      "Kicks",
      "Everything",
    ]);
    expect(names(result.results[0])).toStrictEqual(["kick.aiff"]);
    expect(names(result.results[1])).toStrictEqual([
      "kick.aiff",
      "sample.aiff",
    ]);
  });

  it("omits dbAvailable when no query consulted the DB", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const result = await batch([
      { source: "sample-folder", query: "kick" },
      { source: "sample-folder", query: "sample" },
    ]);

    expect(result).not.toHaveProperty("dbAvailable");
  });

  it("reports dbAvailable when any query consulted the DB", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    // One folder-only query and one that reaches the DB: the roll-up is a
    // property of the batch, not of the query that happened to trigger it.
    const result = await batch([
      { source: "sample-folder", query: "kick" },
      { query: "kick", limit: 1 },
    ]);

    expect(result.dbAvailable).toBe(true);
  });

  it("labels an unlabeled query by its index, and suffixes collisions", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const result = await batch([
      { label: "Kicks", source: "sample-folder", query: "kick" },
      { label: "Kicks", source: "sample-folder", query: "sample" },
      { source: "sample-folder" },
    ]);

    // Every group stays addressable: the first "Kicks" keeps the bare label,
    // the second takes #2, and the unlabeled query falls back to its index.
    expect(result.results.map((entry) => entry.label)).toStrictEqual([
      "Kicks",
      "Kicks#2",
      "2",
    ]);
    expect(names(result.results[1])).toStrictEqual(["sample.aiff"]);
  });

  it("keeps a group for a query that matched nothing", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const result = await batch([
      { label: "Nothing", source: "sample-folder", query: "no-such-sample" },
      { label: "Kicks", source: "sample-folder", query: "kick" },
    ]);

    // A dropped empty group would silently shift every later label's meaning.
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.items).toStrictEqual([]);
    expect(names(result.results[1])).toStrictEqual(["kick.aiff"]);
  });

  it("answers a lone search ungrouped, the way a plain search does", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const result = parseToolResult<BatchEntry & BatchResult>(
      await ctx.client!.callTool({
        name: "ppal-library",
        arguments: {
          searches: [
            { label: "Kicks", source: "sample-folder", query: "kick" },
          ],
        },
      }),
    );

    // Nothing to group, so no results array and no label to group under.
    expect(result).not.toHaveProperty("results");
    expect(result).not.toHaveProperty("label");
    expect(names(result)).toStrictEqual(["kick.aiff"]);
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
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const searches = Array.from({ length: MAX_QUERIES + 1 }, (_, i) => ({
      label: `q${i}`,
      source: "sample-folder",
      query: "kick",
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

    it("reports what lies beyond a cut-off search, and leaves the fields off when nothing does", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const cut = await search({ source: "sample-folder", limit: 1 });
      const whole = await search({ source: "sample-folder", limit: 2 });

      expect(names(cut)).toStrictEqual(["kick.aiff"]);
      expect(cut.more).toBe(1);
      expect(cut.nextOffset).toBe(1);
      expect(whole).not.toHaveProperty("more");
      expect(whole).not.toHaveProperty("nextOffset");
    });

    it("reads the second page from nextOffset, and the last page has no marker", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const first = await search({ source: "sample-folder", limit: 1 });
      const second = await search({
        source: "sample-folder",
        limit: 1,
        offset: first.nextOffset ?? -1,
      });

      expect(names(second)).toStrictEqual(["sample.aiff"]);
      expect(second).not.toHaveProperty("more");
      expect(second).not.toHaveProperty("nextOffset");
    });

    it("pages across the sample folder into Live's library", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      // Both folder files match, so a page of one leaves the other, plus
      // whatever Live's library holds, still to come.
      const first = await search({ query: "aiff", limit: 1 });
      const second = await search({ query: "aiff", limit: 1, offset: 1 });

      expect(names(first)).toStrictEqual(["kick.aiff"]);
      expect(first.more).toBeGreaterThanOrEqual(1);
      expect(first.nextOffset).toBe(1);
      expect(names(second)).toStrictEqual(["sample.aiff"]);
    });

    it("says so when the offset is past the last match", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await search({ source: "sample-folder", offset: 50 });

      expect(result.items).toStrictEqual([]);
      expect(result.detail).toBe("offset 50 is past the last match");
    });

    it("pages each searches entry on its own", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await batch([
        { label: "First", source: "sample-folder", limit: 1 },
        { label: "Second", source: "sample-folder", limit: 1, offset: 1 },
      ]);

      expect(names(result.results[0])).toStrictEqual(["kick.aiff"]);
      expect(result.results[0]).toStrictEqual(
        expect.objectContaining({ more: 1, nextOffset: 1 }),
      );
      expect(names(result.results[1])).toStrictEqual(["sample.aiff"]);
      expect(result.results[1]).not.toHaveProperty("more");
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
