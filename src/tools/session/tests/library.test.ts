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

describe("library tool — folder scan integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scans the configured sample folder and merges with DB results", async () => {
    mockFolderStructure({
      "/samples/": [
        { name: "kick.wav", type: "file", extension: ".wav" },
        { name: "snare.wav", type: "file", extension: ".wav" },
      ],
    });
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

  it("dedupes folder hits against DB hits by absolute path", async () => {
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
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
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
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
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });

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
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
    mockSearchRoute([]);

    const result = await library({}, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    expect(result.dbAvailable).toBe(true);
  });

  it("skips folder scan when tags filter is set (folder has no tag info)", async () => {
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
    mockSearchRoute([]);

    const result = await library(
      { tags: "Kick" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    expect(
      result.items.find((i) => i.source === "sampleFolder"),
    ).toBeUndefined();
    // Tags only live in the DB; readSamples must not be invoked at all
    // (skipping the scan beats filtering its results post-hoc).
    expect(readSamplesMock.readSamples).not.toHaveBeenCalled();
  });

  it("skips folder scan when kind is non-audio", async () => {
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
    mockSearchRoute([]);

    const result = await library(
      { kind: "plugin" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    expect(
      result.items.find((i) => i.source === "sampleFolder"),
    ).toBeUndefined();
    // Folder scan only knows about audio; any non-audio kind must bypass it.
    expect(readSamplesMock.readSamples).not.toHaveBeenCalled();
  });

  it("skips folder scan when deviceKind is set", async () => {
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
    mockSearchRoute([]);

    const result = await library(
      { deviceKind: "instrument" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    expect(
      result.items.find((i) => i.source === "sampleFolder"),
    ).toBeUndefined();
    // deviceKind is DB-only metadata; the scan can't satisfy it.
    expect(readSamplesMock.readSamples).not.toHaveBeenCalled();
  });

  it("invokes the folder scan for audio-compatible filters (positive control)", async () => {
    // Sanity check that the spy actually fires when it should — otherwise
    // the three "not.toHaveBeenCalled" assertions above would pass trivially
    // if the mock were broken.
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
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
    mockFolderStructure({
      "/samples/": [
        { name: "a.wav", type: "file", extension: ".wav" },
        { name: "b.wav", type: "file", extension: ".wav" },
      ],
    });
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
    mockFolderStructure({
      "/samples/": [
        { name: "folder_a.wav", type: "file", extension: ".wav" },
        { name: "folder_z.wav", type: "file", extension: ".wav" },
      ],
    });
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
    mockFolderStructure({
      "/samples/": [
        { name: "kick.wav", type: "file", extension: ".wav" },
        { name: "snare.wav", type: "file", extension: ".wav" },
      ],
    });
    mockSearchRoute([]);

    const result = await library(
      { query: "KICK" },
      { sampleFolder: "/samples/" },
    );

    if (!("items" in result)) throw new Error("expected items");
    expect(result.items.map((i) => i.name)).toStrictEqual(["kick.wav"]);
  });

  it("limit=0 falls back to the default cap rather than returning an empty list", async () => {
    mockFolderStructure({
      "/samples/": [
        { name: "a.wav", type: "file", extension: ".wav" },
        { name: "b.wav", type: "file", extension: ".wav" },
      ],
    });
    mockSearchRoute([]);

    const result = await library({ limit: 0 }, { sampleFolder: "/samples/" });

    if (!("items" in result)) throw new Error("expected items");
    expect(result.items).toHaveLength(2);
  });

  it("sort=name keeps folder items first, each partition sorted alphabetically", async () => {
    mockFolderStructure({
      "/samples/": [
        { name: "z_kick.wav", type: "file", extension: ".wav" },
        { name: "m_snare.wav", type: "file", extension: ".wav" },
      ],
    });
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
    mockFolderStructure({
      "/samples/": [
        { name: "z_folder.wav", type: "file", extension: ".wav" },
        { name: "a_folder.wav", type: "file", extension: ".wav" },
      ],
    });
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
    mockFolderStructure({
      "/samples/": [
        { name: "kick.wav", type: "file", extension: ".wav" },
        { name: "snare.wav", type: "file", extension: ".wav" },
      ],
    });
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
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
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
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });
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
