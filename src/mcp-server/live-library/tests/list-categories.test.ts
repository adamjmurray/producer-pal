// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

    it("returns no tags when a category's leaves have no keyword counts", async () => {
      // Sounds|Bass|Synth Bass: "Synth Bass" isn't a keyword in the fixture.
      const result = await listCategories({ category: "Sounds" });

      expect(result.category).toBe("Sounds");
      expect(result.tags).toStrictEqual([]);
    });

    it("returns an empty tag list for an unknown category", async () => {
      const result = await listCategories({ category: "Nope" });

      expect(result.category).toBe("Nope");
      expect(result.tags).toStrictEqual([]);
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
