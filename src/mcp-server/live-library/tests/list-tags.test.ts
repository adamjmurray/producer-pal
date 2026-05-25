// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
