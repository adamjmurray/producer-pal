// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * Run with: npm run e2e:mcp -- ppal-library-searches
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_FOLDER = resolve(__dirname, "../../../evals/live-sets/samples");

/** The fan-out's hard cap, mirrored from MAX_BATCH_QUERIES. */
const MAX_QUERIES = 20;

/** One query in a `searches` fan-out. */
type BatchQuery = Record<string, string | number | boolean>;

/** One group of results in a fan-out response. */
interface BatchEntry {
  label: string;
  items: Array<{ name: string; source: string | null }>;
  reason?: string;
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
   * The item names in one group, sorted so order within a group can't flake.
   * @param entry - The group to read
   * @returns Sorted item names
   */
  function names(entry: BatchEntry | undefined): string[] {
    return (entry?.items ?? []).map((item) => item.name).toSorted();
  }

  it("applies each query's filters to its own group", async () => {
    // The repo's own sample folder holds exactly kick.aiff and sample.aiff, so
    // these two queries have to come back with different items or the filters
    // aren't being applied per query.
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const result = await batch([
      { label: "Kicks", source: "sampleFolder", query: "kick" },
      { label: "Everything", source: "sampleFolder" },
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
      { source: "sampleFolder", query: "kick" },
      { source: "sampleFolder", query: "sample" },
    ]);

    expect(result).not.toHaveProperty("dbAvailable");
  });

  it("reports dbAvailable when any query consulted the DB", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    // One folder-only query and one that reaches the DB: the roll-up is a
    // property of the batch, not of the query that happened to trigger it.
    const result = await batch([
      { source: "sampleFolder", query: "kick" },
      { query: "kick", limit: 1 },
    ]);

    expect(result.dbAvailable).toBe(true);
  });

  it("labels an unlabeled query by its index, and suffixes collisions", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const result = await batch([
      { label: "Kicks", source: "sampleFolder", query: "kick" },
      { label: "Kicks", source: "sampleFolder", query: "sample" },
      { source: "sampleFolder" },
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
      { label: "Nothing", source: "sampleFolder", query: "no-such-sample" },
      { label: "Kicks", source: "sampleFolder", query: "kick" },
    ]);

    // A dropped empty group would silently shift every later label's meaning.
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.items).toStrictEqual([]);
    expect(names(result.results[1])).toStrictEqual(["kick.aiff"]);
  });

  it("truncates past the query cap and warns", async () => {
    await setConfig({ sampleFolder: SAMPLE_FOLDER });

    const searches = Array.from({ length: MAX_QUERIES + 1 }, (_, i) => ({
      label: `q${i}`,
      source: "sampleFolder",
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
});
