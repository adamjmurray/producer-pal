// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { listCategories } from "../list-categories.ts";
import { setupLibraryFixtureLifecycle } from "./fixtures/library-fixture.ts";

vi.mock(import("../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../live-db-path.ts");

describe("listCategories", () => {
  setupLibraryFixtureLifecycle(dbPathMod);

  it("returns dbAvailable: false when no Live DB is found", async () => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

    const result = await listCategories();

    expect(result.dbAvailable).toBe(false);
    expect(result.categories).toBeUndefined();
  });

  it("degrades to dbAvailable:false when the DB lacks an expected table", async () => {
    // Model a Live DB whose schema has drifted (e.g. a future release renames a
    // selected column or table); the prepare/SELECT throws and the guard must
    // degrade to dbAvailable:false rather than surfacing a raw SQLite error.
    const broken = createDbMissingMetadataTables();

    try {
      vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(broken.dbPath);

      const result = await listCategories();

      expect(result.dbAvailable).toBe(false);
      expect(result.categories).toBeUndefined();
      expect(result.reason).toContain("Failed to read Live database");
    } finally {
      broken.cleanup();
    }
  });

  describe("overview mode (no category)", () => {
    it("lists top-level categories sorted by vocabulary size desc", async () => {
      const result = await listCategories();

      // Fixture paths: Drums has 2 distinct sub-paths, Sounds + Type have 1
      // each. The bare "Core Library" value (no pipe) is excluded.
      expect(result.categories).toStrictEqual([
        { name: "Drums", count: 2 },
        { name: "Sounds", count: 1 },
        { name: "Type", count: 1 },
      ]);
      expect(result.category).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });
  });

  describe("drill-down mode (category given)", () => {
    it("returns a category's leaf tags with keyword-based counts", async () => {
      const result = await listCategories({ category: "Drums" });

      expect(result.category).toBe("Drums");
      // Leaves Kick + Snare Hit; counts come from the keywords table
      // (Kick tags 2 files, Snare Hit tags 1), sorted by count desc.
      expect(result.tags).toStrictEqual([
        { name: "Kick", count: 2 },
        { name: "Snare Hit", count: 1 },
      ]);
      expect(result.categories).toBeUndefined();
    });

    it("returns no tags (and no not-found reason) when a real category's leaves have no keyword counts", async () => {
      // Sounds|Bass|Synth Bass: "Synth Bass" isn't a keyword in the fixture.
      // The category exists (it resolves leaves), so this is NOT a typo — the
      // not-found reason must stay absent to keep the two cases distinguishable.
      const result = await listCategories({ category: "Sounds" });

      expect(result.category).toBe("Sounds");
      expect(result.tags).toStrictEqual([]);
      expect(result.reason).toBeUndefined();
    });

    it("flags an unknown category with a not-found reason", async () => {
      const result = await listCategories({ category: "Nope" });

      expect(result.category).toBe("Nope");
      expect(result.tags).toStrictEqual([]);
      expect(result.reason).toBe("category not found: Nope");
    });

    it("escapes LIKE metacharacters in the category name", async () => {
      // A wildcard-laden name must not match everything; it resolves to no leaves.
      const result = await listCategories({ category: "Dru%" });

      expect(result.tags).toStrictEqual([]);
    });

    it("respects an explicit limit", async () => {
      const result = await listCategories({ category: "Drums", limit: 1 });

      expect(result.tags).toHaveLength(1);
      expect(result.tags?.[0]?.name).toBe("Kick");
    });

    it("clamps invalid limits to the default", async () => {
      const result = await listCategories({ category: "Drums", limit: 0 });

      expect(result.tags?.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Create a temp Live-files DB without the `metadata` / `metadata_values` tables
 * the listCategories SELECT depends on, modeling a schema drift. Preparing the
 * statement throws "no such table".
 *
 * @returns The DB path and a cleanup function removing the temp dir.
 */
function createDbMissingMetadataTables(): {
  dbPath: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "ppal-cats-broken-"));
  const dbPath = join(dir, "Live-files-11000.db");
  const db = new DatabaseSync(dbPath);

  // `metadata` / `metadata_values` deliberately omitted.
  db.exec(`
    CREATE TABLE files (
      file_id INTEGER PRIMARY KEY,
      name TEXT
    );
  `);
  db.close();

  return {
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
