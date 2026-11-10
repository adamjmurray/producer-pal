// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { librarySearch } from "../../query/library-search.ts";
import { setupLibraryFixtureLifecycle } from "../fixtures/library-fixture.ts";

vi.mock(import("../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../../live-db-path.ts");

// Audio by use-count desc, with file ids: pack_kick (2001), user_kick (1001),
// user_snare (1002), pack_clap (2002), subfolder_x (211), subfolder_z (221),
// subfolder_y (212).
describe("librarySearch excludeFileIds", () => {
  setupLibraryFixtureLifecycle(dbPathMod);

  it("leaves the excluded files out of the rows", async () => {
    const result = await librarySearch({
      kind: "audio",
      limit: 3,
      excludeFileIds: [2001, 1002],
    });

    expect(result.items.map((i) => i.name)).toStrictEqual([
      "user_kick.aif",
      "pack_clap.aif",
      "subfolder_x.wav",
    ]);
  });

  it("counts only what the exclusion leaves", async () => {
    const result = await librarySearch({
      kind: "audio",
      limit: 3,
      excludeFileIds: [2001, 1002],
    });

    // 7 audio files, 2 excluded, 3 shown.
    expect(result.more).toBe(2);
  });

  it("applies the offset to the rows that remain", async () => {
    const result = await librarySearch({
      kind: "audio",
      limit: 3,
      offset: 2,
      excludeFileIds: [2001],
    });

    expect(result.items.map((i) => i.name)).toStrictEqual([
      "pack_clap.aif",
      "subfolder_x.wav",
      "subfolder_z.wav",
    ]);
    expect(result.more).toBe(1);
  });

  it("reports no more when what follows the page is all excluded", async () => {
    const result = await librarySearch({
      kind: "audio",
      limit: 5,
      excludeFileIds: [221, 212],
    });

    expect(result.items).toHaveLength(5);
    expect(result).not.toHaveProperty("more");
  });

  it("finds nothing beyond the last row once the exclusions are out", async () => {
    const result = await librarySearch({
      kind: "audio",
      limit: 1,
      offset: 4,
      excludeFileIds: [211, 221],
    });

    expect(result.items.map((i) => i.name)).toStrictEqual(["subfolder_y.wav"]);
    expect(result).not.toHaveProperty("more");
  });

  it("takes a list far longer than SQLite's bound-parameter limit", async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => 100_000 + i);
    const result = await librarySearch({
      kind: "audio",
      limit: 2,
      excludeFileIds: [...ids, 2001],
    });

    expect(result.items.map((i) => i.name)).toStrictEqual([
      "user_kick.aif",
      "user_snare.wav",
    ]);
    expect(result.more).toBe(4);
  });

  it("changes nothing for an empty list", async () => {
    const plain = await librarySearch({ kind: "audio", limit: 3 });
    const empty = await librarySearch({
      kind: "audio",
      limit: 3,
      excludeFileIds: [],
    });

    expect(empty).toStrictEqual(plain);
  });
});
