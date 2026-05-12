// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockFolderStructure } from "#src/test/mocks/mock-folder.ts";
import { library } from "./library.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

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
    // Folder items get source: "folder"
    expect(result.items.find((i) => i.name === "kick.wav")?.source).toBe(
      "folder",
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
    expect(kicks[0]?.source).toBe("folder");
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
    expect(result.items.find((i) => i.source === "folder")).toBeUndefined();
  });

  it("source: 'folder' returns folder items only and skips DB call", async () => {
    mockFolderStructure({
      "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
    });

    const result = await library(
      { source: "folder" },
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
    expect(result.items.find((i) => i.source === "folder")).toBeUndefined();
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
    expect(result.items.find((i) => i.source === "folder")).toBeUndefined();
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
    expect(result.items.find((i) => i.source === "folder")).toBeUndefined();
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

  it("default sort places DB items (by useCount desc) before folder items", async () => {
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
    // Folder items inherit useCount=0, so they fall to the end naturally;
    // alphabetical tiebreak orders folder_a before folder_z.
    expect(result.items.map((i) => i.name)).toStrictEqual([
      "high_use.wav",
      "low_use.wav",
      "folder_a.wav",
      "folder_z.wav",
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

  it("sort=name reorders folder + DB items together alphabetically", async () => {
    mockFolderStructure({
      "/samples/": [{ name: "z_kick.wav", type: "file", extension: ".wav" }],
    });
    mockSearchRoute([
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
    expect(result.items.map((i) => i.name)).toStrictEqual([
      "a_clap.wav",
      "z_kick.wav",
    ]);
  });

  it("sort=mod_date keeps DB order then appends folder items", async () => {
    mockFolderStructure({
      "/samples/": [{ name: "f.wav", type: "file", extension: ".wav" }],
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
    expect(result.items.map((i) => i.name)).toStrictEqual([
      "newer.wav",
      "older.wav",
      "f.wav",
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
  });
});
