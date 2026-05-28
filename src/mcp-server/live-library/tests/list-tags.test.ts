// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { listTags } from "../list-tags.ts";
import { setupLibraryFixtureLifecycle } from "./fixtures/library-fixture.ts";

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
      expect(result.reason).toContain("Failed to read Live database");
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
  const dir = mkdtempSync(join(tmpdir(), "ppal-tags-broken-"));
  const dbPath = join(dir, "Live-files-11000.db");
  const db = new DatabaseSync(dbPath);

  // `keywords` deliberately omitted; an unrelated table exists so the DB opens.
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
