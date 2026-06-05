// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { findDuplicates } from "../../query/find-duplicates.ts";
import {
  expectQueryDegradesOnBrokenDb,
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

const SUB_A = "/Users/test/Music/Ableton/Factory Packs/Pack One/SubA";

/**
 * Flatten every filename across all returned duplicate groups.
 *
 * @param groups - Duplicate groups from a findDuplicates result
 * @returns Every item name across the groups
 */
function allNames(groups: { items: { name: string }[] }[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.name));
}

describe("findDuplicates", () => {
  setupLibraryFixtureLifecycle(dbPathMod);

  beforeEach(() => {
    vi.mocked(stalenessMod.detectStalenessRisk).mockResolvedValue(undefined);
  });

  it("groups byte-identical samples by hash, largest group first", async () => {
    const result = await findDuplicates({});

    expect(result.dbAvailable).toBe(true);
    expect(result.groups).toHaveLength(2);
    // Group A (size 3) sorts ahead of group B (size 2).
    expect(result.groups[0]?.count).toBe(3);
    expect(result.groups[0]?.items.map((i) => i.name).sort()).toStrictEqual([
      "pack_clap.aif",
      "subfolder_x.wav",
      "subfolder_z.wav",
    ]);
    expect(result.groups[1]?.count).toBe(2);
    expect(result.groups[1]?.items.map((i) => i.name).sort()).toStrictEqual([
      "pack_kick.wav",
      "user_kick.aif",
    ]);
  });

  it("excludes invalid-format rows even when their hash matches (version insurance)", async () => {
    // subfolder_y.wav (212) carries group A's hash but an unreadable header.
    const result = await findDuplicates({});

    expect(allNames(result.groups)).not.toContain("subfolder_y.wav");
  });

  it("keeps near-max int64 hashes distinct via CAST AS TEXT", async () => {
    // user_snare's hash (…806) rounds to the same JS double as group A's hash
    // (…807); precise grouping must not fold the unique snare into the group.
    const result = await findDuplicates({});

    expect(allNames(result.groups)).not.toContain("user_snare.wav");
  });

  it("scopes detection with inFolder (no remaining duplicate group)", async () => {
    // SubA holds subfolder_x (dup vector) + subfolder_y (invalid header), so no
    // 2-member valid group survives the folder scope.
    const result = await findDuplicates({ inFolder: SUB_A });

    expect(result.groups).toStrictEqual([]);
  });

  it("surfaces a staleness advisory from the DB layer", async () => {
    vi.mocked(stalenessMod.detectStalenessRisk).mockResolvedValue(
      STALENESS_RISK,
    );

    const result = await findDuplicates({});

    expect(result.stalenessRisk).toStrictEqual(STALENESS_RISK);
  });

  it("reports an unresolvable inFolder", async () => {
    const result = await findDuplicates({ inFolder: "/no/such/folder" });

    expect(result.groups).toStrictEqual([]);
    expect(result.reason).toContain("inFolder path not found");
  });

  it("reports source:sampleFolder rather than a silent empty set", async () => {
    // sampleFolder files aren't in Live's fe_values index, so this can only ever
    // match nothing — explain it instead of returning an unexplained empty set.
    const result = await findDuplicates({ source: "sampleFolder" });

    expect(result.dbAvailable).toBe(true);
    expect(result.groups).toStrictEqual([]);
    expect(result.reason).toContain("sampleFolder");
  });

  it("degrades to dbAvailable:false when the Live DB is missing", async () => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

    const result = await findDuplicates({});

    expect(result.dbAvailable).toBe(false);
    expect(result.reason).toBe("Live database not found");
  });

  it("degrades to dbAvailable:false when a query throws", async () => {
    await expectQueryDegradesOnBrokenDb(dbPathMod, () => findDuplicates({}));
  });
});
