// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live files its Core Library as a pack, but it ships with Live: `source`
// calls it builtin.

import { type DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { fourCC } from "../../../library-filters.ts";
import { librarySearch } from "../../../query/library-search.ts";
import { setupLibraryFixtureLifecycle } from "../../fixtures/library-fixture.ts";

vi.mock(import("../../../live-db-path.ts"));

const dbPathMod = await import("../../../live-db-path.ts");

/**
 * Add a Core Library place, filed as a pack like Live does, with one sample.
 * @param db - Writable fixture DB
 */
function addCoreLibrary(db: DatabaseSync): void {
  const insert = db.prepare(
    `INSERT INTO files
     (file_id, parent_id, file_type, file_kind, name, use_count, mod_date, device_type, place_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insert.run(700, 5, fourCC("fldr"), 512, "Core Library", 0, 0, 0, 0);
  insert.run(7001, 700, fourCC("wav-"), 4, "core_kick.wav", 7, 0, 0, 700);
  db.prepare(
    "INSERT INTO places (file_id, folder_kind, name) VALUES (?, ?, ?)",
  ).run(700, 0, "Core Library");
}

describe("librarySearch — the Core Library", () => {
  setupLibraryFixtureLifecycle(dbPathMod, addCoreLibrary);

  it("reports its files as builtin", async () => {
    const result = await librarySearch({ query: "core_kick" });

    expect(result.items.map((i) => [i.name, i.source])).toStrictEqual([
      ["core_kick.wav", "builtin"],
    ]);
  });

  it("finds its files with source=builtin, beside the Built-in place's", async () => {
    const result = await librarySearch({ source: "builtin" });

    expect(result.items.map((i) => i.name).toSorted()).toStrictEqual([
      "EQ Eight.vst3",
      "Operator.vst3",
      "core_kick.wav",
    ]);
  });

  it("leaves its files out of source=pack", async () => {
    const result = await librarySearch({ source: "pack" });

    expect(result.items.map((i) => i.name)).not.toContain("core_kick.wav");
    expect(result.items.length).toBeGreaterThan(0);
  });
});
