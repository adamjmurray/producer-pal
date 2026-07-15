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

describe("library tool — searchBatch action", () => {
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

  it("returns results per query in order, grouped under their labels", async () => {
    mockSearchByFilter({
      Kick: [dbItem("kick.wav")],
      Snare: [dbItem("snare.wav")],
    });

    const result = await library({
      action: "searchBatch",
      queries: [
        { label: "Kick", tags: "Kick" },
        { label: "Snare", tags: "Snare" },
      ],
    });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.results.map((r) => r.label)).toStrictEqual(["Kick", "Snare"]);
    expect(result.results[0]?.items.map((i) => i.name)).toStrictEqual([
      "kick.wav",
    ]);
    expect(result.results[1]?.items.map((i) => i.name)).toStrictEqual([
      "snare.wav",
    ]);
    expect(result.dbAvailable).toBe(true);
  });

  it("defaults the label to the query index (as a string) when omitted", async () => {
    mockSearchByFilter({
      Kick: [dbItem("kick.wav")],
      "808": [dbItem("a.wav")],
    });

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }, { query: "808" }],
    });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.results.map((r) => r.label)).toStrictEqual(["0", "1"]);
  });

  it("suffixes duplicate labels with #N so every entry stays addressable", async () => {
    mockSearchByFilter({ Kick: [dbItem("kick.wav")] });

    const result = await library({
      action: "searchBatch",
      queries: [
        { label: "Kicks", tags: "Kick" },
        { label: "Kicks", tags: "Kick" },
        { label: "Kicks", tags: "Kick" },
      ],
    });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.results.map((r) => r.label)).toStrictEqual([
      "Kicks",
      "Kicks#2",
      "Kicks#3",
    ]);
  });

  it("dedupes a provided label that collides with an index fallback", async () => {
    mockSearchByFilter({});

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }, { label: "0", tags: "Snare" }],
    });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.results.map((r) => r.label)).toStrictEqual(["0", "0#2"]);
  });

  it("yields an empty items entry (not a dropped entry) for a no-match query", async () => {
    mockSearchByFilter({ Kick: [dbItem("kick.wav")] });

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }, { tags: "Cowbell" }],
    });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.results).toHaveLength(2);
    expect(result.results[1]?.items).toStrictEqual([]);
  });

  it("applies per-query filters independently (tags vs query)", async () => {
    mockSearchByFilter({
      Kick: [dbItem("kick.wav")],
      "808": [dbItem("808.wav")],
    });

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }, { query: "808" }],
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
    expect(result.results[0]?.items.map((i) => i.name)).toStrictEqual([
      "kick.wav",
    ]);
    expect(result.results[1]?.items.map((i) => i.name)).toStrictEqual([
      "808.wav",
    ]);
  });

  it("threads inFolder per query through to the library.search route", async () => {
    mockSearchByFilter({});

    await library({
      action: "searchBatch",
      queries: [
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
    const consoleModule = await import("#src/shared/v8-max-console.ts");
    const warnSpy = vi
      .spyOn(consoleModule, "warn")
      .mockImplementation(() => {});

    mockSearchByFilter({});

    const queries = Array.from({ length: 25 }, (_, i) => ({
      query: String(i),
    }));
    const result = await library({ action: "searchBatch", queries });

    if (!("results" in result)) throw new Error("expected results");
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
    const consoleModule = await import("#src/shared/v8-max-console.ts");
    const warnSpy = vi
      .spyOn(consoleModule, "warn")
      .mockImplementation(() => {});

    mockSearchByFilter({});

    const queries = Array.from({ length: 20 }, (_, i) => ({
      query: String(i),
    }));
    const result = await library({ action: "searchBatch", queries });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.results).toHaveLength(20);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("treats a missing queries arg as an empty batch", async () => {
    const result = await library({ action: "searchBatch" });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.results).toStrictEqual([]);
    expect("dbAvailable" in result).toBe(false);
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
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

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }],
    });

    if (!("results" in result)) throw new Error("expected results");
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

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }, { tags: "Snare" }],
    });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.dbAvailable).toBe(false);
    expect(result.results[0]?.items).toHaveLength(1);
  });

  it("omits top-level dbAvailable when every query bypasses the DB", async () => {
    mockSampleFolder("kick.wav");

    const result = await library(
      {
        action: "searchBatch",
        queries: [{ source: "sampleFolder" }],
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

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }, { tags: "Snare" }],
    });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.stalenessRisk).toStrictEqual(stalenessRisk);
    expect(result.dbAvailable).toBe(true);
  });

  it("omits stalenessRisk when no DB-consulting query reports it", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, items: [] },
    });

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }],
    });

    if (!("results" in result)) throw new Error("expected results");
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

    const result = await library({
      action: "searchBatch",
      queries: [{ tags: "Kick" }, { tags: "Snare" }],
    });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.stalenessRisk).toStrictEqual(first);
  });

  it("omits the reason key on an entry whose query returned no reason", async () => {
    // A matched query with no diagnostic must yield { label, items } exactly —
    // no reason: undefined leaking into the entry.
    mockSearchByFilter({ Kick: [dbItem("kick.wav")] });

    const result = await library({
      action: "searchBatch",
      queries: [{ label: "Kicks", tags: "Kick" }],
    });

    if (!("results" in result)) throw new Error("expected results");
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

    const result = await library({
      action: "searchBatch",
      queries: [
        { label: "Kicks", tags: "Kick" },
        { label: "Snares", tags: "Snare" },
        { label: "Hats", tags: "Hat" },
      ],
    });

    if (!("results" in result)) throw new Error("expected results");
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
      action: "searchBatch",
      queries: [
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
