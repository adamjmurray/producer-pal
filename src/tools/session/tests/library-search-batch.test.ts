// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockFolderStructure } from "#src/test/mocks/mock-folder.ts";
import { library } from "../library.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

vi.mock(import("../read-samples.ts"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, readSamples: vi.fn(actual.readSamples) };
});

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

/**
 * Stub the "/samples/" folder with the given top-level .wav file names.
 *
 * @param names - File names to place directly under "/samples/"
 */
function mockSampleFolder(...names: string[]): void {
  mockFolderStructure({
    "/samples/": names.map((name) => ({
      name,
      type: "file" as const,
      extension: ".wav",
    })),
  });
}

type SearchBatchResult = Extract<
  Awaited<ReturnType<typeof library>>,
  { results: unknown }
>;

/**
 * Run a fanned-out library search and narrow the union to the results branch.
 * @param searches - The per-query filter sets
 * @returns The library result, asserted to contain `results`
 */
async function runSearchBatch(
  searches: NonNullable<Parameters<typeof library>[0]>["searches"],
): Promise<SearchBatchResult> {
  const result = await library({ action: "search", searches });

  if (!("results" in result)) throw new Error("expected results");

  return result;
}

/**
 * The names of the items one labeled result carries.
 * @param result - A fan-out search result
 * @param index - Which labeled result to read
 * @returns Item names, or undefined if there is no result at that index
 */
function itemNamesAt(
  result: SearchBatchResult,
  index: number,
): string[] | undefined {
  return result.results[index]?.items.map((item) => item.name);
}

/**
 * Spy on the Max console's warn, silencing the output.
 * @returns The spy
 */
async function spyOnMaxWarn() {
  const consoleModule = await import("#src/shared/max/v8-max-console.ts");

  return vi.spyOn(consoleModule, "warn").mockImplementation(() => {});
}

describe("library tool — searches fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Stub library.search to return items keyed off the request's `query`
   * (or `tags`) so each batch query can be given distinct results.
   *
   * @param byFilter - Maps a query/tags value to the items to return
   */
  function mockSearchByFilter(byFilter: Record<string, unknown[]>): void {
    vi.mocked(protocolMock.requestNode).mockImplementation(
      async (_route, routeArgs) => {
        const a = routeArgs as { query?: string; tags?: string };
        const key = a.query ?? a.tags ?? "";

        return {
          success: true,
          result: { dbAvailable: true, items: byFilter[key] ?? [] },
        };
      },
    );
  }

  /**
   * Build a minimal DB library item for the given name.
   *
   * @param name - Item name
   * @returns A LibraryItem-shaped object
   */
  function dbItem(name: string): Record<string, unknown> {
    return {
      name,
      path: `/L/${name}`,
      kind: "audio",
      tags: [],
      useCount: 1,
      source: "user",
    };
  }

  /** A DB holding one kick and one snare, keyed by their tags. */
  function mockKickAndSnare(): void {
    mockSearchByFilter({
      Kick: [dbItem("kick.wav")],
      Snare: [dbItem("snare.wav")],
    });
  }

  /**
   * Fan out `count` numbered queries against an empty DB.
   * @param count - How many queries to send
   * @returns The library result
   */
  async function runNumberedSearchBatch(
    count: number,
  ): Promise<SearchBatchResult> {
    mockSearchByFilter({});

    return await runSearchBatch(
      Array.from({ length: count }, (_, index) => ({ query: String(index) })),
    );
  }

  it("returns results per query in order, grouped under their labels", async () => {
    mockKickAndSnare();

    const result = await runSearchBatch([
      { label: "Kick", tags: "Kick" },
      { label: "Snare", tags: "Snare" },
    ]);

    expect(result.results.map((r) => r.label)).toStrictEqual(["Kick", "Snare"]);
    expect(itemNamesAt(result, 0)).toStrictEqual(["kick.wav"]);
    expect(itemNamesAt(result, 1)).toStrictEqual(["snare.wav"]);
    expect(result.dbAvailable).toBe(true);
  });

  it("defaults the label to the query index (as a string) when omitted", async () => {
    mockSearchByFilter({
      Kick: [dbItem("kick.wav")],
      "808": [dbItem("a.wav")],
    });

    const result = await runSearchBatch([{ tags: "Kick" }, { query: "808" }]);

    expect(result.results.map((r) => r.label)).toStrictEqual(["0", "1"]);
  });

  it("suffixes duplicate labels with #N so every entry stays addressable", async () => {
    mockSearchByFilter({ Kick: [dbItem("kick.wav")] });

    const result = await runSearchBatch([
      { label: "Kicks", tags: "Kick" },
      { label: "Kicks", tags: "Kick" },
      { label: "Kicks", tags: "Kick" },
    ]);

    expect(result.results.map((r) => r.label)).toStrictEqual([
      "Kicks",
      "Kicks#2",
      "Kicks#3",
    ]);
  });

  it("dedupes a provided label that collides with an index fallback", async () => {
    mockSearchByFilter({});

    const result = await runSearchBatch([
      { tags: "Kick" },
      { label: "0", tags: "Snare" },
    ]);

    expect(result.results.map((r) => r.label)).toStrictEqual(["0", "0#2"]);
  });

  it("yields an empty items entry (not a dropped entry) for a no-match query", async () => {
    mockSearchByFilter({ Kick: [dbItem("kick.wav")] });

    const result = await runSearchBatch([
      { tags: "Kick" },
      { tags: "Cowbell" },
    ]);

    expect(result.results).toHaveLength(2);
    expect(result.results[1]?.items).toStrictEqual([]);
  });

  it("applies per-query filters independently (tags vs query)", async () => {
    mockSearchByFilter({
      Kick: [dbItem("kick.wav")],
      "808": [dbItem("808.wav")],
    });

    const result = await library({
      action: "search",
      searches: [{ tags: "Kick" }, { query: "808" }],
    });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ tags: "Kick" }),
    );
    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ query: "808" }),
    );
    if (!("results" in result)) throw new Error("expected results");
    expect(itemNamesAt(result, 0)).toStrictEqual(["kick.wav"]);
    expect(itemNamesAt(result, 1)).toStrictEqual(["808.wav"]);
  });

  it("threads inFolder per query through to the library.search route", async () => {
    mockSearchByFilter({});

    await library({
      action: "search",
      searches: [
        { label: "Kicks", tags: "Kick", inFolder: "/L/Drums/Kicks" },
        { label: "Snares", tags: "Snare" },
      ],
    });

    expect(protocolMock.requestNode).toHaveBeenNthCalledWith(
      1,
      "library.search",
      expect.objectContaining({ inFolder: "/L/Drums/Kicks", tags: "Kick" }),
    );
    expect(protocolMock.requestNode).toHaveBeenNthCalledWith(
      2,
      "library.search",
      expect.not.objectContaining({ inFolder: expect.anything() }),
    );
  });

  it("truncates to the first 20 queries and warns", async () => {
    const warnSpy = await spyOnMaxWarn();
    const result = await runNumberedSearchBatch(25);

    expect(result.results).toHaveLength(20);
    expect(protocolMock.requestNode).toHaveBeenCalledTimes(20);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("exceeds cap of 20"),
    );
    // The dropped count must be queries - cap (25 - 20 = 5), not a sum.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ignoring the extra 5"),
    );

    warnSpy.mockRestore();
  });

  it("does not warn when the batch is exactly at the cap of 20", async () => {
    // Boundary of the > cap guard: 20 queries is allowed in full, so no warn.
    const warnSpy = await spyOnMaxWarn();
    const result = await runNumberedSearchBatch(20);

    expect(result.results).toHaveLength(20);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // An empty array names no filters at all, so grouping nothing would just
  // hide the mistake. Fall back to the single search the top-level params
  // describe, and say so.
  it("falls back to a single search when searches is empty, and warns", async () => {
    const consoleModule = await import("#src/shared/max/v8-max-console.ts");
    const warnSpy = vi
      .spyOn(consoleModule, "warn")
      .mockImplementation(() => {});

    mockSearchByFilter({ Kick: [{ path: "/db/kick.wav" }] });

    const result = await library({
      action: "search",
      searches: [],
      tags: "Kick",
    });

    expect("results" in result).toBe(false);
    expect(result).toStrictEqual({
      dbAvailable: true,
      items: [{ path: "/db/kick.wav" }],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("searches was empty"),
    );

    warnSpy.mockRestore();
  });

  it("warns and ignores searches on an action that has no use for it", async () => {
    const consoleModule = await import("#src/shared/max/v8-max-console.ts");
    const warnSpy = vi
      .spyOn(consoleModule, "warn")
      .mockImplementation(() => {});

    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { tags: [] },
    });

    await library({ action: "listTags", searches: [{ tags: "Kick" }] });

    expect(protocolMock.requestNode).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('searches does not apply to action "listTags"'),
    );

    warnSpy.mockRestore();
  });

  // The spellings the fan-out shipped under before it folded into search +
  // searches. Each still reaches the handler, so a 2.2 script gets results
  // instead of a schema error.
  it.each([
    [
      "queries",
      { action: "search", queries: [{ label: "Kick", tags: "Kick" }] },
    ],
    [
      "the searchBatch action",
      { action: "searchBatch", searches: [{ label: "Kick", tags: "Kick" }] },
    ],
    [
      "both old names at once",
      { action: "searchBatch", queries: [{ label: "Kick", tags: "Kick" }] },
    ],
  ])("runs the fan-out for a caller still on %s", async (_label, args) => {
    mockSearchByFilter({ Kick: [dbItem("kick.wav")] });

    expect(await library(args)).toStrictEqual({
      dbAvailable: true,
      results: [{ label: "Kick", items: [dbItem("kick.wav")] }],
    });
  });

  it("warns when a caller still sends the searchBatch action", async () => {
    const warnSpy = await spyOnMaxWarn();

    mockSearchByFilter({ Kick: [dbItem("kick.wav")] });

    await library({
      action: "searchBatch",
      searches: [{ label: "Kick", tags: "Kick" }],
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'action "searchBatch" is deprecated and will be removed; use action "search" with searches instead',
    );

    warnSpy.mockRestore();
  });

  it("prefers searches when a caller sends both names", async () => {
    mockKickAndSnare();

    const result = await library({
      action: "search",
      searches: [{ label: "Kick", tags: "Kick" }],
      queries: [{ label: "Snare", tags: "Snare" }],
    });

    expect(result).toStrictEqual({
      dbAvailable: true,
      results: [{ label: "Kick", items: [dbItem("kick.wav")] }],
    });
  });

  it("reports dbAvailable:false when any query finds the DB missing", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: {
        dbAvailable: false,
        items: [],
        reason: "Live database not found",
      },
    });

    const result = await runSearchBatch([{ tags: "Kick" }]);

    expect(result.dbAvailable).toBe(false);
    expect(result.results[0]?.reason).toBe("Live database not found");
  });

  it("downgrades dbAvailable to false when only some queries find the DB missing", async () => {
    vi.mocked(protocolMock.requestNode)
      .mockResolvedValueOnce({
        success: true,
        result: { dbAvailable: true, items: [dbItem("kick.wav")] },
      })
      .mockResolvedValueOnce({
        success: true,
        result: {
          dbAvailable: false,
          items: [],
          reason: "Live database not found",
        },
      });

    const result = await runSearchBatch([{ tags: "Kick" }, { tags: "Snare" }]);

    expect(result.dbAvailable).toBe(false);
    expect(result.results[0]?.items).toHaveLength(1);
  });

  it("omits top-level dbAvailable when every query bypasses the DB", async () => {
    mockSampleFolder("kick.wav");

    const result = await library(
      {
        action: "search",
        searches: [{ source: "sampleFolder" }],
      },
      { sampleFolder: "/samples/" },
    );

    if (!("results" in result)) throw new Error("expected results");
    expect("dbAvailable" in result).toBe(false);
    expect(result.results[0]?.items.map((i) => i.name)).toStrictEqual([
      "kick.wav",
    ]);
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("surfaces stalenessRisk from any DB-consulting query at the batch level", async () => {
    const stalenessRisk = {
      kind: "wal-pending" as const,
      dbMtime: 1_000_000,
      walMtime: 4_600_000,
      walSizeMb: 12,
      ageSeconds: 3_600,
    };

    vi.mocked(protocolMock.requestNode)
      .mockResolvedValueOnce({
        success: true,
        result: { dbAvailable: true, items: [dbItem("kick.wav")] },
      })
      .mockResolvedValueOnce({
        success: true,
        result: {
          dbAvailable: true,
          stalenessRisk,
          items: [dbItem("snare.wav")],
        },
      });

    const result = await runSearchBatch([{ tags: "Kick" }, { tags: "Snare" }]);

    expect(result.stalenessRisk).toStrictEqual(stalenessRisk);
    expect(result.dbAvailable).toBe(true);
  });

  it("omits stalenessRisk when no DB-consulting query reports it", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, items: [] },
    });

    const result = await runSearchBatch([{ tags: "Kick" }]);

    expect("stalenessRisk" in result).toBe(false);
  });

  it("keeps the first stalenessRisk reading when two queries report different ones", async () => {
    // Staleness is a single global DB property; the batch captures the first
    // non-null reading and must not overwrite it with a later query's copy.
    const first = {
      kind: "wal-pending" as const,
      dbMtime: 1_000_000,
      walMtime: 4_600_000,
      walSizeMb: 12,
      ageSeconds: 3_600,
    };
    const second = {
      kind: "wal-pending" as const,
      dbMtime: 9_000_000,
      walMtime: 9_600_000,
      walSizeMb: 99,
      ageSeconds: 9_999,
    };

    vi.mocked(protocolMock.requestNode)
      .mockResolvedValueOnce({
        success: true,
        result: { dbAvailable: true, stalenessRisk: first, items: [] },
      })
      .mockResolvedValueOnce({
        success: true,
        result: { dbAvailable: true, stalenessRisk: second, items: [] },
      });

    const result = await runSearchBatch([{ tags: "Kick" }, { tags: "Snare" }]);

    expect(result.stalenessRisk).toStrictEqual(first);
  });

  it("omits the reason key on an entry whose query returned no reason", async () => {
    // A matched query with no diagnostic must yield { label, items } exactly —
    // no reason: undefined leaking into the entry.
    mockSearchByFilter({ Kick: [dbItem("kick.wav")] });

    const result = await runSearchBatch([{ label: "Kicks", tags: "Kick" }]);
    const entry = result.results[0];

    expect(entry).toBeDefined();
    expect(entry && "reason" in entry).toBe(false);
  });

  it("preserves entries from other queries when a single query throws (per-query graceful degrade)", async () => {
    vi.mocked(protocolMock.requestNode)
      .mockResolvedValueOnce({
        success: true,
        result: { dbAvailable: true, items: [dbItem("kick.wav")] },
      })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        success: true,
        result: { dbAvailable: true, items: [dbItem("hat.wav")] },
      });

    const result = await runSearchBatch([
      { label: "Kicks", tags: "Kick" },
      { label: "Snares", tags: "Snare" },
      { label: "Hats", tags: "Hat" },
    ]);

    expect(result.results.map((r) => r.label)).toStrictEqual([
      "Kicks",
      "Snares",
      "Hats",
    ]);
    expect(result.results[0]?.items.map((i) => i.name)).toStrictEqual([
      "kick.wav",
    ]);
    expect(result.results[1]?.items).toStrictEqual([]);
    expect(result.results[1]?.reason).toBe("boom");
    expect(result.results[2]?.items.map((i) => i.name)).toStrictEqual([
      "hat.wav",
    ]);
  });

  it("threads verifyPaths per query so only flagged entries get pathExists wiring", async () => {
    mockSearchByFilter({});

    await library({
      action: "search",
      searches: [
        { label: "Kicks", tags: "Kick", verifyPaths: true },
        { label: "Snares", tags: "Snare" },
      ],
    });

    expect(protocolMock.requestNode).toHaveBeenNthCalledWith(
      1,
      "library.search",
      expect.objectContaining({ tags: "Kick", verifyPaths: true }),
    );
    expect(protocolMock.requestNode).toHaveBeenNthCalledWith(
      2,
      "library.search",
      expect.not.objectContaining({ verifyPaths: expect.anything() }),
    );
  });
});
