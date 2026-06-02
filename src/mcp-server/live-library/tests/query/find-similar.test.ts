// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { findSimilar } from "../../query/find-similar.ts";
import {
  createBrokenLibraryDb,
  setupLibraryFixtureLifecycle,
} from "../fixtures/library-fixture.ts";

vi.mock(import("../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));
vi.mock(import("../../db-staleness.ts"), () => ({
  detectStalenessRisk: vi.fn(),
}));

const dbPathMod = await import("../../live-db-path.ts");
const stalenessMod = await import("../../db-staleness.ts");

const PACK_ONE = "/Users/test/Music/Ableton/Factory Packs/Pack One";
const SEED_KICK = "/Users/test/Music/Ableton/User Library/user_kick.aif";
// pack_riff.mid has no fe_values row — a real file Live hasn't fingerprinted.
const UNANALYZED = `${PACK_ONE}/pack_riff.mid`;

describe("findSimilar", () => {
  setupLibraryFixtureLifecycle(dbPathMod);

  beforeEach(() => {
    vi.mocked(stalenessMod.detectStalenessRisk).mockResolvedValue(undefined);
  });

  it("ranks audio candidates by similarity, identical kick first", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK });
    const names = result.items.map((i) => i.name);
    const sims = result.items.map((i) => i.similarity);

    expect(result.dbAvailable).toBe(true);
    expect(result.seed).toStrictEqual({ path: SEED_KICK, found: true });
    // pack_kick has the identical vector → top match (cosine ~1.0).
    expect(names[0]).toBe("pack_kick.wav");
    expect(result.items[0]?.similarity).toBeGreaterThan(0.9);
    // Descending similarity order.
    expect(sims).toStrictEqual([...sims].sort((a, b) => b - a));
    // The seed itself and the invalid-header row are excluded.
    expect(names).not.toContain("user_kick.aif");
    expect(names).not.toContain("subfolder_y.wav");
  });

  it("returns every audio sample that has a valid vector", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK });

    expect(result.items.map((i) => i.name).sort()).toStrictEqual([
      "pack_clap.aif",
      "pack_kick.wav",
      "subfolder_x.wav",
      "subfolder_z.wav",
      "user_snare.wav",
    ]);
  });

  it("carries full library-item fields alongside the similarity score", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK });
    const top = result.items[0];

    expect(top?.path).toBe(`${PACK_ONE}/pack_kick.wav`);
    expect(top?.source).toBe("pack");
    expect(top?.tags).toContain("Kick");
    expect(typeof top?.similarity).toBe("number");
  });

  it("constrains candidates with tags (more kicks like this kick)", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK, tags: "Kick" });

    expect(result.items.map((i) => i.name)).toStrictEqual(["pack_kick.wav"]);
  });

  it("constrains candidates with inFolder", async () => {
    const result = await findSimilar({
      similarTo: SEED_KICK,
      inFolder: PACK_ONE,
    });

    expect(result.items.map((i) => i.name).sort()).toStrictEqual([
      "pack_clap.aif",
      "pack_kick.wav",
    ]);
  });

  it("respects limit", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.name).toBe("pack_kick.wav");
  });

  it("surfaces a staleness advisory from the DB layer", async () => {
    const risk = {
      kind: "wal-pending" as const,
      dbMtime: 1,
      walMtime: 2,
      walSizeMb: 1,
      ageSeconds: 1,
    };

    vi.mocked(stalenessMod.detectStalenessRisk).mockResolvedValue(risk);

    const result = await findSimilar({ similarTo: SEED_KICK });

    expect(result.stalenessRisk).toStrictEqual(risk);
  });

  it("reports a missing similarTo arg without throwing", async () => {
    const result = await findSimilar({});

    expect(result.seed.found).toBe(false);
    expect(result.items).toStrictEqual([]);
    expect(result.reason).toContain("similarTo is required");
  });

  it("reports a seed that isn't in Live's library", async () => {
    const result = await findSimilar({ similarTo: "/nope/missing.wav" });

    expect(result.seed.found).toBe(false);
    expect(result.reason).toContain("not in Live's library");
  });

  it("reports a seed that exists but has no fingerprint yet", async () => {
    const result = await findSimilar({ similarTo: UNANALYZED });

    expect(result.seed.found).toBe(false);
    expect(result.reason).toContain("hasn't analyzed");
  });

  it("reports an unresolvable inFolder (seed found, no candidates)", async () => {
    const result = await findSimilar({
      similarTo: SEED_KICK,
      inFolder: "/no/such/folder",
    });

    expect(result.seed.found).toBe(true);
    expect(result.items).toStrictEqual([]);
    expect(result.reason).toContain("inFolder path not found");
  });

  it("degrades to dbAvailable:false when the Live DB is missing", async () => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

    const result = await findSimilar({ similarTo: SEED_KICK });

    expect(result.dbAvailable).toBe(false);
    expect(result.seed.found).toBe(false);
    expect(result.reason).toBe("Live database not found");
  });

  it("degrades to dbAvailable:false when a query throws", async () => {
    const broken = createBrokenLibraryDb();

    try {
      vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(broken.dbPath);

      const result = await findSimilar({ similarTo: SEED_KICK });

      expect(result.dbAvailable).toBe(false);
      expect(result.reason).toContain("Failed to read Live database");
    } finally {
      broken.cleanup();
    }
  });
});
