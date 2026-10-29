// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { fourCC } from "../../../library-filters.ts";
import { librarySearch } from "../../../query/library-search.ts";
import { setupLibraryFixtureLifecycle } from "../../fixtures/library-fixture.ts";

vi.mock(import("../../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../../../live-db-path.ts");

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

describe("librarySearch rack note, several racks", () => {
  setupLibraryFixtureLifecycle(dbPathMod, addSecondRack);

  it("counts the racks and uses the plural", async () => {
    const result = await librarySearch({ kind: "preset", query: "chain" });

    expect(result.items).toStrictEqual([]);
    expect(result.note).toBe("2 matching racks (.adg) are kind device-group");
  });
});

/**
 * @param db - Open writable DB
 */
function addSecondRack(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO files
     (file_id, parent_id, file_type, file_kind, name, use_count, mod_date, device_type, place_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(2050, 200, fourCC("adg-"), 32, "pack_chain_two.adg", 1, 0, 0, 200);
}
