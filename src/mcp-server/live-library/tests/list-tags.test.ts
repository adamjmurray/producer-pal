// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { fourCC } from "../library-filters.ts";
import { MAX_LIBRARY_LIMIT } from "../library-types.ts";
import { listTags } from "../list-tags.ts";
import {
  addManyTags,
  createPartialSchemaDb,
  FILES_ONLY_SCHEMA,
  setupLibraryFixtureLifecycle,
} from "./fixtures/library-fixture.ts";

vi.mock(import("../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../live-db-path.ts");

describe("listTags", () => {
  setupLibraryFixtureLifecycle(dbPathMod);

  it("returns dbAvailable: false when no Live DB is found", async () => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

    const result = await listTags();

    expect(result.dbAvailable).toBe(false);
    expect(result.tags).toHaveLength(0);
  });

  it("degrades to dbAvailable:false when the DB lacks an expected column", async () => {
    // Model a Live DB whose schema has drifted (e.g. a future release renames a
    // selected column); the prepare/SELECT throws and the guard must degrade to
    // dbAvailable:false rather than surfacing a raw SQLite error to the LLM.
    const broken = createDbMissingKeywordsTable();

    try {
      vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(broken.dbPath);

      const result = await listTags();

      expect(result.dbAvailable).toBe(false);
      expect(result.tags).toHaveLength(0);
      expect(result.detail).toContain("Failed to read Live database");
    } finally {
      broken.cleanup();
    }
  });

  it("returns tags sorted by usage count descending", async () => {
    const result = await listTags();
    const names = result.tags.map((t) => t.name);

    // Fixture: One Shot tags 3 files, Kick tags 2, Punchy 1, Snare Hit 1
    expect(names[0]).toBe("One Shot");
    expect(names[1]).toBe("Kick");
  });

  it("attaches accurate counts", async () => {
    const result = await listTags();
    const counts = new Map(result.tags.map((t) => [t.name, t.count]));

    expect(counts.get("One Shot")).toBe(3);
    expect(counts.get("Kick")).toBe(2);
    expect(counts.get("Punchy")).toBe(1);
    expect(counts.get("Snare Hit")).toBe(1);
  });

  it("respects an explicit limit", async () => {
    const result = await listTags({ limit: 2 });

    expect(result.tags).toHaveLength(2);
  });

  it("clamps invalid limits to default", async () => {
    const result = await listTags({ limit: 0 });

    expect(result.tags.length).toBeGreaterThan(0);
  });

  it("says how many tags the limit left out, with no way to page", async () => {
    // Fixture: 5 tags.
    const result = await listTags({ limit: 2 });

    expect(result.tags).toHaveLength(2);
    expect(result.more).toBe(3);
    expect(result).not.toHaveProperty("nextOffset");
  });

  it("leaves `more` off when every tag fits", async () => {
    expect(await listTags({ limit: 5 })).not.toHaveProperty("more");
    expect(await listTags()).not.toHaveProperty("more");
  });
});

/**
 * A second tag named Kick, on a file that has the first and one that doesn't.
 * @param db - Writable fixture DB
 */
function addSecondKickTag(db: DatabaseSync): void {
  db.prepare(
    "INSERT INTO files (file_id, parent_id, file_type, file_kind, name) VALUES (9050, 1, ?, 0, 'Kick')",
  ).run(fourCC("keyw"));
  db.exec(
    "INSERT INTO keywords (file_id, keyw_id, is_auto) VALUES (1001, 9050, 0), (1002, 9050, 0)",
  );
}

// Live files a tag under each category that has it ("Percussion" under Drums
// and under Grooves), and a search filters by the name alone.
describe("listTags - two tags with one name", () => {
  setupLibraryFixtureLifecycle(dbPathMod, addSecondKickTag);

  it("lists the name once, counting each file once", async () => {
    const result = await listTags();

    expect(result.tags.filter((tag) => tag.name === "Kick")).toStrictEqual([
      { name: "Kick", count: 3 },
    ]);
  });
});

describe("listTags - limit cap", () => {
  setupLibraryFixtureLifecycle(dbPathMod, addManyTags);

  it("returns at most 1000 tags and counts the rest", async () => {
    const result = await listTags({ limit: 5_000 });

    // 1,100 new tags plus the fixture's 5.
    expect(result.tags).toHaveLength(MAX_LIBRARY_LIMIT);
    expect(result.more).toBe(105);
  });
});

/**
 * Create a temp Live-files DB that omits the `keywords` table the listTags
 * SELECT depends on, modeling a schema drift. Preparing the statement throws
 * "no such table".
 *
 * @returns The DB path and a cleanup function removing the temp dir.
 */
function createDbMissingKeywordsTable(): {
  dbPath: string;
  cleanup: () => void;
} {
  // `keywords` deliberately omitted; `files` exists so the DB still opens.
  return createPartialSchemaDb(
    "ppal-tags-broken-",
    FILES_ONLY_SCHEMA,
    "Live-files-11000.db",
  );
}
