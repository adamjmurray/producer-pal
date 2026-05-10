// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { searchSamples } from "../search-samples.ts";

vi.mock(import("../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../live-db-path.ts");

let scratchDir: string;
let dbPath: string;

/**
 * Create a fixture DB modeled on Live's `files` schema with a small
 * audio sample tree under /Users/test/Music/Samples.
 *
 * @param path - Filesystem path for the new DB file
 */
function createFixtureDb(path: string): void {
  const db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE files (
      file_id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      file_type INTEGER,
      file_kind INTEGER,
      name TEXT,
      use_count INTEGER DEFAULT 0
    );
  `);

  const insert = db.prepare(
    "INSERT INTO files (file_id, parent_id, file_kind, name, use_count) VALUES (?, ?, ?, ?, ?)",
  );

  // Folder chain: / -> Users -> test -> Music -> Samples
  insert.run(1, 0, 512, "/", 0);
  insert.run(2, 1, 512, "Users", 0);
  insert.run(3, 2, 512, "test", 0);
  insert.run(4, 3, 512, "Music", 0);
  insert.run(5, 4, 512, "Samples", 0);

  // Audio samples (file_kind 4 = WAV/AIFF, 2048 = compressed)
  insert.run(10, 5, 4, "kick.wav", 50);
  insert.run(11, 5, 4, "snare.wav", 25);
  insert.run(12, 5, 2048, "hat.mp3", 100);
  insert.run(13, 5, 4, "kick_other.wav", 5);

  // Non-audio file (file_kind 2 = .alc clip): must NOT match
  insert.run(14, 5, 2, "loop.alc", 200);

  // Orphan: parent_id points to a nonexistent file_id, so parent walk
  // breaks early. Used to exercise the chain-broken branch.
  insert.run(20, 9999, 4, "orphan.wav", 1);

  db.close();
}

describe("searchSamples", () => {
  beforeAll(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "ppal-search-samples-test-"));
    dbPath = join(scratchDir, "Live-files-12300.db");
    createFixtureDb(dbPath);
  });

  beforeEach(() => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(dbPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it("returns dbAvailable: false when no Live DB is found", async () => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

    const result = await searchSamples();

    expect(result.dbAvailable).toBe(false);
    expect(result.samples).toHaveLength(0);
    expect(result.reason).toContain("Live database not found");
  });

  it("returns all audio files when no query is given", async () => {
    const result = await searchSamples();

    expect(result.dbAvailable).toBe(true);
    expect(result.samples.map((s) => s.name)).toStrictEqual([
      "hat.mp3",
      "kick.wav",
      "snare.wav",
      "kick_other.wav",
      "orphan.wav",
    ]);
  });

  it("excludes non-audio file kinds", async () => {
    const result = await searchSamples();
    const names = result.samples.map((s) => s.name);

    expect(names).not.toContain("loop.alc");
  });

  it("sorts by use_count descending", async () => {
    const result = await searchSamples();
    const counts = result.samples.map((s) => s.useCount);

    expect(counts).toStrictEqual([100, 50, 25, 5, 1]);
  });

  it("filters by name substring", async () => {
    const result = await searchSamples({ query: "kick" });

    expect(result.samples.map((s) => s.name)).toStrictEqual([
      "kick.wav",
      "kick_other.wav",
    ]);
  });

  it("matches case-insensitively for ASCII (SQL LIKE default)", async () => {
    // SQLite's LIKE is ASCII-case-insensitive by default but NOT
    // Unicode-case-insensitive — that distinction will matter for
    // non-English filenames if we ever loosen the audio-only filter.
    const upper = await searchSamples({ query: "KICK" });

    expect(upper.samples.map((s) => s.name)).toStrictEqual([
      "kick.wav",
      "kick_other.wav",
    ]);
  });

  it("reconstructs absolute path by walking parent chain", async () => {
    const result = await searchSamples({ query: "kick.wav" });

    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]?.path).toBe("/Users/test/Music/Samples/kick.wav");
  });

  it("respects an explicit limit", async () => {
    const result = await searchSamples({ limit: 2 });

    expect(result.samples).toHaveLength(2);
  });

  it("clamps invalid or zero limits to default", async () => {
    const negative = await searchSamples({ limit: -10 });
    const zero = await searchSamples({ limit: 0 });

    expect(negative.samples.length).toBeGreaterThan(0);
    expect(zero.samples.length).toBeGreaterThan(0);
  });

  it("clamps oversize limits", async () => {
    const result = await searchSamples({ limit: 999_999 });

    // Fixture has 4 normal audio rows + 1 orphan = 5 audio rows total.
    expect(result.samples.length).toBeLessThanOrEqual(5);
  });

  it("returns partial path when the parent chain breaks early", async () => {
    const result = await searchSamples({ query: "orphan" });

    expect(result.samples).toHaveLength(1);
    // Orphan's parent_id points to a missing file_id; we get just the leaf name.
    expect(result.samples[0]?.path).toBe("/orphan.wav");
  });
});
