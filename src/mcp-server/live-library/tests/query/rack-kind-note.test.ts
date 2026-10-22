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

describe("librarySearch rack note", () => {
  setupLibraryFixtureLifecycle(dbPathMod);

  it("says racks match when a preset search finds nothing", async () => {
    const result = await librarySearch({ kind: "preset", query: "chain" });

    expect(result.items).toStrictEqual([]);
    expect(result.note).toBe("1 matching rack (.adg) is kind device-group");
  });

  it("says nothing when no rack matches either", async () => {
    const result = await librarySearch({ kind: "preset", query: "kick" });

    expect(result.items).toStrictEqual([]);
    expect(result.note).toBeUndefined();
  });

  it("says nothing for other kinds", async () => {
    const result = await librarySearch({ kind: "audio", query: "chain" });

    expect(result.note).toBeUndefined();
  });
});
