// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fourCC } from "../../library-filters.ts";
import { findSimilar } from "../../query/find-similar.ts";
import {
  expectQueryDegradesOnBrokenDb,
  expectQueryDegradesWithoutDb,
  expectSampleFolderExplained,
  featureBlob,
  KICK_VECTOR,
  setupLibraryFixtureLifecycle,
  STALENESS_RISK,
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

/**
 * Add User Library candidates that exercise the ranking and Live's candidate
 * rules against the user_kick.aif seed.
 *
 * @param db - Open writable fixture DB
 */
function addSimilarityCandidates(db: DatabaseSync): void {
  const file = db.prepare(
    `INSERT INTO files (file_id, parent_id, file_type, file_kind, name, place_id, flags)
     VALUES (?, 100, ?, ?, ?, ?, ?)`,
  );
  const fe = db.prepare(
    "INSERT INTO fe_values (file_id, data, hash) VALUES (?, ?, ?)",
  );
  const wav = fourCC("wav-");
  const shifted = (by: number) => featureBlob(KICK_VECTOR.map((x) => x + by));

  // Closest visible match.
  file.run(5001, wav, 4, "near_kick.wav", 100, 1027);
  fe.run(5001, shifted(0.1), 5001n);
  // Same direction as the seed but twice as loud: cosine calls it identical,
  // Euclidean doesn't.
  file.run(5002, wav, 4, "loud_kick.wav", 100, 1027);
  fe.run(5002, featureBlob(KICK_VECTOR.map((x) => x * 2)), 5002n);
  // Nearer still, but left out by Live (flags & 1 is 0).
  file.run(5003, wav, 4, "hidden_kick.wav", 100, 1026);
  fe.run(5003, shifted(0.01), 5003n);
  // Nearer still, but in no browser Place (e.g. inside another Live install).
  file.run(5004, wav, 4, "other_install_kick.wav", 0, 1027);
  fe.run(5004, shifted(0.01), 5004n);
  // A preset preview: Live mixes file kinds in one list.
  file.run(5008, fourCC("adg-"), 32, "kick_rack.adg", 100, 1027);
  fe.run(5008, shifted(0.5), 5008n);
  // A unique fingerprint in an unknown format: skipped, not fatal.
  file.run(5005, wav, 4, "future_format.wav", 100, 1027);
  fe.run(5005, featureBlob(KICK_VECTOR, 99), 5005n);
  // Two copies of one sound; the lower file_id is unreadable, so the other
  // copy stands in for it.
  file.run(5006, wav, 4, "copy_unreadable.wav", 100, 1027);
  fe.run(
    5006,
    featureBlob(
      KICK_VECTOR.map((x) => x + 3),
      99,
    ),
    5006n,
  );
  file.run(5007, wav, 4, "copy_readable.wav", 100, 1027);
  fe.run(5007, shifted(3), 5006n);
  db.prepare(
    "INSERT INTO keywords (file_id, keyw_id, is_auto) VALUES (5001, 9001, 0)",
  ).run();
}

describe("findSimilar", () => {
  setupLibraryFixtureLifecycle(dbPathMod, addSimilarityCandidates);

  beforeEach(() => {
    vi.mocked(stalenessMod.detectStalenessRisk).mockResolvedValue(undefined);
  });

  it("ranks by Euclidean distance, nearest first", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK });
    const names = result.items.map((i) => i.name);
    const distances = result.items.map((i) => i.distance);

    expect(result.dbAvailable).toBe(true);
    expect(result.seed).toStrictEqual({ path: SEED_KICK, found: true });
    // 64 components each 0.1 away → sqrt(64 * 0.01) = 0.8.
    expect(names[0]).toBe("near_kick.wav");
    expect(distances[0]).toBe(0.8);
    // Cosine would rank the louder copy first; distance doesn't.
    expect(names.indexOf("loud_kick.wav")).toBeGreaterThan(0);
    expect(distances).toStrictEqual(distances.toSorted((a, b) => a - b));
  });

  it("returns one listed file per audio fingerprint, of any kind", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK });

    // Excluded: the seed and its copy pack_kick.wav (same hash), the flagged
    // file, the file outside every Place, the unknown-format rows, and
    // pack_clap/subfolder_z (same audio as subfolder_x, lowest file_id).
    expect(result.items.map((i) => i.name).toSorted()).toStrictEqual([
      "copy_readable.wav",
      "kick_rack.adg",
      "loud_kick.wav",
      "near_kick.wav",
      "subfolder_x.wav",
      "user_snare.wav",
    ]);
  });

  it("carries full library-item fields alongside the distance", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK });
    const top = result.items[0];

    expect(top?.path).toBe(
      "/Users/test/Music/Ableton/User Library/near_kick.wav",
    );
    expect(top?.source).toBe("user");
    expect(top?.tags).toContain("Kick");
    expect(typeof top?.distance).toBe("number");
  });

  it("constrains candidates with tags (more kicks like this kick)", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK, tags: "Kick" });

    expect(result.items.map((i) => i.name)).toStrictEqual(["near_kick.wav"]);
  });

  it("constrains candidates with inFolder", async () => {
    const result = await findSimilar({
      similarTo: SEED_KICK,
      inFolder: PACK_ONE,
    });

    // pack_clap is the only copy of its audio inside this folder, so it stays.
    expect(result.items.map((i) => i.name)).toStrictEqual(["pack_clap.aif"]);
  });

  it("respects limit", async () => {
    const result = await findSimilar({ similarTo: SEED_KICK, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.name).toBe("near_kick.wav");
  });

  it("surfaces a staleness advisory from the DB layer", async () => {
    vi.mocked(stalenessMod.detectStalenessRisk).mockResolvedValue(
      STALENESS_RISK,
    );

    const result = await findSimilar({ similarTo: SEED_KICK });

    expect(result.stalenessRisk).toStrictEqual(STALENESS_RISK);
  });

  it("reports a missing similarTo arg without throwing", async () => {
    const result = await findSimilar({});

    expect(result.seed.found).toBe(false);
    expect(result.items).toStrictEqual([]);
    expect(result.detail).toContain("similarTo is required");
  });

  it("reports a seed that isn't in Live's library", async () => {
    const result = await findSimilar({ similarTo: "/nope/missing.wav" });

    expect(result.seed.found).toBe(false);
    expect(result.detail).toContain("not in Live's library");
  });

  it("reports a seed that exists but has no fingerprint", async () => {
    const result = await findSimilar({ similarTo: UNANALYZED });

    expect(result.seed.found).toBe(false);
    expect(result.detail).toBe("Live has no audio analysis for this sample");
  });

  it("accepts a seed that Live leaves out of results", async () => {
    const result = await findSimilar({
      similarTo: "/Users/test/Music/Ableton/User Library/hidden_kick.wav",
    });

    expect(result.seed.found).toBe(true);
    expect(result.items[0]?.name).toBe("user_kick.aif");
  });

  it("treats a seed with an unreadable fingerprint as un-analyzed", async () => {
    const result = await findSimilar({
      similarTo: `${PACK_ONE}/SubA/subfolder_y.wav`,
    });

    expect(result.seed.found).toBe(false);
    expect(result.detail).toBe("Live has no audio analysis for this sample");
  });

  it("reports an unresolvable inFolder (seed found, no candidates)", async () => {
    const result = await findSimilar({
      similarTo: SEED_KICK,
      inFolder: "/no/such/folder",
    });

    expect(result.seed.found).toBe(true);
    expect(result.items).toStrictEqual([]);
    expect(result.detail).toContain("inFolder path not found");
  });

  it("reports source:sampleFolder rather than a silent empty set", async () => {
    await expectSampleFolderExplained(
      () => findSimilar({ similarTo: SEED_KICK, source: "sample-folder" }),
      (r) => r.items,
    );
  });

  it("degrades to dbAvailable:false when the Live DB is missing", async () => {
    const result = await expectQueryDegradesWithoutDb(dbPathMod, () =>
      findSimilar({ similarTo: SEED_KICK }),
    );

    expect(result.seed.found).toBe(false);
  });

  it("degrades to dbAvailable:false when a query throws", async () => {
    await expectQueryDegradesOnBrokenDb(dbPathMod, () =>
      findSimilar({ similarTo: SEED_KICK }),
    );
  });
});
