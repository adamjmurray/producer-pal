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

// Wrap the real readSamples in a spy so existing tests keep their
// mockFolderStructure-driven behavior, while letting new tests assert
// the folder scan was skipped entirely (call count = 0).
vi.mock(import("../read-samples.ts"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, readSamples: vi.fn(actual.readSamples) };
});

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");
const readSamplesMock = await import("../read-samples.ts");

/**
 * Stub the library.search route with the given items.
 *
 * @param items - Items the route should return
 */
function mockSearchRoute(items: unknown[]): void {
  vi.mocked(protocolMock.requestNode).mockResolvedValue({
    success: true,
    result: { dbAvailable: true, items },
  });
}

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

/**
 * Assert a filter bypasses the folder scan entirely: no sampleFolder-sourced
 * items in the result and readSamples never invoked.
 *
 * @param filter - The library filter under test
 */
async function expectFolderScanSkipped(
  filter: Parameters<typeof library>[0],
): Promise<void> {
  mockSampleFolder("kick.wav");
  mockSearchRoute([]);

  const result = await library(filter, { sampleFolder: "/samples/" });

  if (!("items" in result)) throw new Error("expected items");
  expect(result.items.find((i) => i.source === "sampleFolder")).toBeUndefined();
  expect(readSamplesMock.readSamples).not.toHaveBeenCalled();
}

describe("library tool — action dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches search action to library.search route by default", async () => {
    mockSearchRoute([]);

    await library({ query: "kick", kind: "audio" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ query: "kick", kind: "audio" }),
    );
  });

  it("passes inFolder through to the library.search route", async () => {
    mockSearchRoute([]);

    await library({ inFolder: "/some/folder" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ inFolder: "/some/folder" }),
    );
  });

  it("passes verifyPaths through to the library.search route", async () => {
    mockSearchRoute([]);

    await library({ query: "kick", verifyPaths: true });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ verifyPaths: true }),
    );
  });

  it("propagates the stale-WAL advisory from the search route", async () => {
    const stalenessRisk = {
      kind: "wal-pending" as const,
      dbMtime: 1_000_000,
      walMtime: 4_600_000,
      walSizeMb: 18,
      ageSeconds: 3_600,
    };

    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, stalenessRisk, items: [] },
    });

    const result = await library({ query: "kick" });

    if (!("items" in result)) throw new Error("expected items");
    expect(result.stalenessRisk).toStrictEqual(stalenessRisk);
  });

  it("dispatches listTags action to library.listTags route", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, tags: [] },
    });

    await library({ action: "listTags", limit: 50 });

    expect(protocolMock.requestNode).toHaveBeenCalledWith("library.listTags", {
      limit: 50,
    });
  });

  it("dispatches listCategories action, forwarding category + limit", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, category: "Drums", tags: [] },
    });

    await library({ action: "listCategories", category: "Drums", limit: 5 });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.listCategories",
      { category: "Drums", limit: 5 },
    );
  });

  it("throws with a clean message when the route returns failure", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: false,
      error: "Live database not found",
    });

    await expect(library({ query: "kick" })).rejects.toThrow(
      "library.search failed: Live database not found",
    );
  });

  it("throws with 'unknown error' when failure has no message", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({ success: false });

    await expect(library({ query: "kick" })).rejects.toThrow(/unknown error/);
  });

  it("throws on unknown action", async () => {
    await expect(library({ action: "bogus" })).rejects.toThrow(
      "Unknown action: bogus",
    );
  });
});

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

    warnSpy.mockRestore();
  });

  it("treats a missing queries arg as an empty batch", async () => {
    const result = await library({ action: "searchBatch" });

    if (!("results" in result)) throw new Error("expected results");
    expect(result.results).toStrictEqual([]);
    // No query consulted the DB, so dbAvailable is omitted.
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
    // One query saw the DB fine, another didn't — global state is "not fully
    // available", so false.
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
});

describe("library tool — folder scan integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scans the configured sample folder and merges with DB results", async () => {
    mockSampleFolder("kick.wav", "snare.wav");
    mockSearchRoute([
      {
        name: "clap.wav",
        path: "/Library/clap.wav",
        kind: "audio",
        tags: [],
        useCount: 7,
        source: "user",
      },
    ]);

    const result = await library({ query: "" }, { sampleFolder: "/samples/" });

    expect("items" in result).toBe(true);
    if (!("items" in result)) return;

    const names = result.items.map((i) => i.name);

    expect(names).toContain("kick.wav");
    expect(names).toContain("snare.wav");
    expect(names).toContain("clap.wav");
    // Folder items get source: "sampleFolder"
    expect(result.items.find((i) => i.name === "kick.wav")?.source).toBe(
      "sampleFolder",
    );
  });

  it("marks sampleFolder items pathExists: true when verifyPaths is set", async () => {
    mockSampleFolder("kick.wav");
    mockSearchRoute([]);

    const result = await library(
      { query: "", verifyPaths: true },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    const kick = result.items.find((i) => i.source === "sampleFolder");

    // Folder-scan items came from a live filesystem enumeration, so they're
    // reported as existing without a redundant re-stat.
    expect(kick?.pathExists).toBe(true);
  });

  it("dedupes folder hits against DB hits by absolute path", async () => {
    mockSampleFolder("kick.wav");
    mockSearchRoute([
      {
        name: "kick.wav",
        path: "/samples/kick.wav",
        kind: "audio",
        tags: [],
        useCount: 99,
        source: "user",
      },
    ]);

    const result = await library({}, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");

    const kicks = result.items.filter((i) => i.name === "kick.wav");

    expect(kicks).toHaveLength(1);
    // Folder wins (it's user-explicit)
    expect(kicks[0]?.source).toBe("sampleFolder");
  });

  it("skips folder scan when source is a DB-only category", async () => {
    mockSampleFolder("kick.wav");
    mockSearchRoute([]);

    const result = await library(
      { source: "pack" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    expect(
      result.items.find((i) => i.source === "sampleFolder"),
    ).toBeUndefined();
  });

  it("source: 'sampleFolder' returns folder items only and skips DB call", async () => {
    mockSampleFolder("kick.wav");

    const result = await library(
      { source: "sampleFolder" },
      { sampleFolder: "/samples/" },
    );

    expect(protocolMock.requestNode).not.toHaveBeenCalled();
    if (!("items" in result)) throw new Error("expected items");
    expect(result.items.map((i) => i.name)).toStrictEqual(["kick.wav"]);
    // Folder-only requests bypass the DB; dbAvailable should be absent
    // rather than fabricated.
    expect("dbAvailable" in result).toBe(false);
  });

  it("merged requests propagate dbAvailable from the DB call", async () => {
    mockSampleFolder("kick.wav");
    mockSearchRoute([]);

    const result = await library({}, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    expect(result.dbAvailable).toBe(true);
  });

  it("skips folder scan when tags filter is set (folder has no tag info)", async () => {
    // Tags only live in the DB; readSamples must not be invoked at all
    // (skipping the scan beats filtering its results post-hoc).
    await expectFolderScanSkipped({ tags: "Kick" });
  });

  it("skips folder scan when type filter is set (folder has no tag info)", async () => {
    // Playback type derives from DB Type-tags; the folder scan has none.
    await expectFolderScanSkipped({ type: "loop" });
  });

  it("skips folder scan when kind is non-audio", async () => {
    // Folder scan only knows about audio; any non-audio kind must bypass it.
    await expectFolderScanSkipped({ kind: "plugin" });
  });

  it("skips folder scan when deviceKind is set", async () => {
    // deviceKind is DB-only metadata; the scan can't satisfy it.
    await expectFolderScanSkipped({ deviceKind: "instrument" });
  });

  it("skips folder scan when inFolder is set (DB-only path resolution)", async () => {
    // inFolder resolves against the DB's file hierarchy, not the filesystem.
    await expectFolderScanSkipped({ inFolder: "/some/folder" });
  });

  it("invokes the folder scan for audio-compatible filters (positive control)", async () => {
    // Sanity check that the spy actually fires when it should — otherwise
    // the three "not.toHaveBeenCalled" assertions above would pass trivially
    // if the mock were broken.
    mockSampleFolder("kick.wav");
    mockSearchRoute([]);

    await library({ kind: "audio" }, { sampleFolder: "/samples/" });

    expect(readSamplesMock.readSamples).toHaveBeenCalledTimes(1);
  });

  it("works without a configured sampleFolder (DB-only)", async () => {
    mockSearchRoute([
      {
        name: "clap.wav",
        path: "/L/clap.wav",
        kind: "audio",
        tags: [],
        useCount: 1,
        source: "user",
      },
    ]);

    const result = await library({}, {});

    if (!("items" in result)) throw new Error("expected items");
    expect(result.items).toHaveLength(1);
  });

  it("respects limit after merging", async () => {
    mockSampleFolder("a.wav", "b.wav");
    mockSearchRoute([
      {
        name: "c.wav",
        path: "/L/c.wav",
        kind: "audio",
        tags: [],
        useCount: 5,
        source: "user",
      },
    ]);

    const result = await library({ limit: 2 }, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    expect(result.items).toHaveLength(2);
  });

  it("default sort places folder items before DB items, each ordered internally", async () => {
    mockSampleFolder("folder_a.wav", "folder_z.wav");
    mockSearchRoute([
      {
        name: "high_use.wav",
        path: "/L/high_use.wav",
        kind: "audio",
        tags: [],
        useCount: 99,
        source: "user",
      },
      {
        name: "low_use.wav",
        path: "/L/low_use.wav",
        kind: "audio",
        tags: [],
        useCount: 1,
        source: "user",
      },
    ]);

    const result = await library({}, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    // Folder partition first (alphabetical tiebreaker at useCount=0),
    // then DB partition (useCount desc).
    expect(result.items.map((i) => i.name)).toStrictEqual([
      "folder_a.wav",
      "folder_z.wav",
      "high_use.wav",
      "low_use.wav",
    ]);
  });

  it("folder scan query is case-insensitive", async () => {
    mockSampleFolder("kick.wav", "snare.wav");
    mockSearchRoute([]);

    const result = await library(
      { query: "KICK" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    expect(result.items.map((i) => i.name)).toStrictEqual(["kick.wav"]);
  });

  it("limit=0 falls back to the default cap rather than returning an empty list", async () => {
    mockSampleFolder("a.wav", "b.wav");
    mockSearchRoute([]);

    const result = await library({ limit: 0 }, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    expect(result.items).toHaveLength(2);
  });

  it("sort=name keeps folder items first, each partition sorted alphabetically", async () => {
    mockSampleFolder("z_kick.wav", "m_snare.wav");
    mockSearchRoute([
      {
        name: "b_hat.wav",
        path: "/L/b_hat.wav",
        kind: "audio",
        tags: [],
        useCount: 0,
        source: "user",
      },
      {
        name: "a_clap.wav",
        path: "/L/a_clap.wav",
        kind: "audio",
        tags: [],
        useCount: 0,
        source: "user",
      },
    ]);

    const result = await library(
      { sort: "name" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    // Folder partition first, each partition sorted alphabetically.
    expect(result.items.map((i) => i.name)).toStrictEqual([
      "m_snare.wav",
      "z_kick.wav",
      "a_clap.wav",
      "b_hat.wav",
    ]);
  });

  it("sort=mod_date keeps folder items first then DB items in upstream order", async () => {
    mockSampleFolder("z_folder.wav", "a_folder.wav");
    mockSearchRoute([
      {
        name: "newer.wav",
        path: "/L/newer.wav",
        kind: "audio",
        tags: [],
        useCount: 0,
        source: "user",
      },
      {
        name: "older.wav",
        path: "/L/older.wav",
        kind: "audio",
        tags: [],
        useCount: 0,
        source: "user",
      },
    ]);

    const result = await library(
      { sort: "mod_date" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    // Folder partition sorted by name (no mod_date metadata), then DB
    // partition in upstream mod_date order.
    expect(result.items.map((i) => i.name)).toStrictEqual([
      "a_folder.wav",
      "z_folder.wav",
      "newer.wav",
      "older.wav",
    ]);
  });

  it("query filter applies to folder scan", async () => {
    mockSampleFolder("kick.wav", "snare.wav");
    mockSearchRoute([]);

    const result = await library(
      { query: "kick" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    expect(result.items.map((i) => i.name)).toStrictEqual(["kick.wav"]);
  });

  it("surfaces a reason when source=sampleFolder is requested with no sampleFolder", async () => {
    // Regression vs the old ppal-context search: silently returning [] makes
    // the LLM tell the user "no samples found"; the reason field lets it say
    // "you need to configure a sample folder".
    const result = await library({ source: "sampleFolder" }, {});

    if (!("items" in result)) throw new Error("expected items");
    expect(result.items).toHaveLength(0);
    expect(result.reason).toMatch(/sample folder not configured/i);
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("preserves the DB-side reason when the merged DB call returns one", async () => {
    mockSampleFolder("kick.wav");
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: {
        dbAvailable: false,
        items: [],
        reason: "Live database not found",
      },
    });

    const result = await library({}, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    expect(result.dbAvailable).toBe(false);
    expect(result.reason).toBe("Live database not found");
    // Folder items should still come through alongside the diagnostic.
    expect(result.items.map((i) => i.name)).toStrictEqual(["kick.wav"]);
  });

  it("surfaces a reason when the folder scan throws", async () => {
    vi.mocked(readSamplesMock.readSamples).mockImplementationOnce(() => {
      throw new Error("EACCES: permission denied");
    });
    mockSearchRoute([]);

    const result = await library({}, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    expect(result.reason).toMatch(/sample folder scan failed.*EACCES/);
    // DB results should still flow through.
    expect(result.dbAvailable).toBe(true);
  });

  it("extracts the leaf filename from nested folder paths", async () => {
    mockFolderStructure({
      "/samples/": [{ name: "drums", type: "fold" }],
      "/samples/drums/": [
        { name: "snare.wav", type: "file", extension: ".wav" },
      ],
    });
    mockSearchRoute([]);

    const result = await library({}, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");

    const item = result.items.find((i) => i.path.endsWith("snare.wav"));

    expect(item?.name).toBe("snare.wav");
    expect(item?.path).toBe("/samples/drums/snare.wav");
    // Immediate parent folder of a nested sample is its last folder segment.
    expect(item?.folder).toBe("drums");
  });

  it("uses the sample folder's basename as folder for top-level files", async () => {
    mockSampleFolder("kick.wav");
    mockSearchRoute([]);

    const result = await library({}, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    // A top-level sample has no folder segment of its own, so its parent is
    // the configured sample folder itself ("/samples/" → "samples").
    expect(result.items.find((i) => i.name === "kick.wav")?.folder).toBe(
      "samples",
    );
  });
});
