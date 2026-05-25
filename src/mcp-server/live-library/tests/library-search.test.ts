// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { librarySearch } from "../library-search.ts";
import { setupLibraryFixtureLifecycle } from "./library-fixture.ts";

vi.mock(import("../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

// The fixture builds its DB with node:fs (sync), so mocking node:fs/promises
// here only affects the verifyPaths stat() calls under test.
vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, stat: vi.fn() };
});

const dbPathMod = await import("../live-db-path.ts");
const { stat } = await import("node:fs/promises");

describe("librarySearch", () => {
  setupLibraryFixtureLifecycle(dbPathMod);

  it("returns dbAvailable: false when no Live DB is found", async () => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

    const result = await librarySearch();

    expect(result.dbAvailable).toBe(false);
    expect(result.items).toHaveLength(0);
    expect(result.reason).toContain("Live database not found");
  });

  describe("kind filter", () => {
    it("returns only audio files when kind=audio", async () => {
      const result = await librarySearch({ kind: "audio" });

      // Specific names pin down the kind→fourCC mapping so a regression
      // that returns the wrong audio items would fail (rather than just
      // "every item has kind audio", which holds via the reverse map).
      // Order is default use_count desc: pack_kick (100) > user_kick (50)
      // > user_snare (25) > pack_clap (5) > subfolder_x (3) > subfolder_z (2)
      // > subfolder_y (1).
      expect(result.items.map((i) => i.name)).toStrictEqual([
        "pack_kick.wav",
        "user_kick.aif",
        "user_snare.wav",
        "pack_clap.aif",
        "subfolder_x.wav",
        "subfolder_z.wav",
        "subfolder_y.wav",
      ]);
      expect(result.items.every((i) => i.kind === "audio")).toBe(true);
    });

    it("returns only plugins when kind=plugin", async () => {
      const result = await librarySearch({ kind: "plugin" });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "EQ Eight.vst3",
        "Operator.vst3",
      ]);
    });

    it("returns only .mid files when kind=midi (excludes Live clips)", async () => {
      const result = await librarySearch({ kind: "midi" });

      expect(result.items.map((i) => i.name)).toStrictEqual(["pack_riff.mid"]);
    });

    it("returns only .alc files when kind=live-clip", async () => {
      const result = await librarySearch({ kind: "live-clip" });

      expect(result.items.map((i) => i.name)).toStrictEqual(["pack_loop.alc"]);
    });

    it("returns only .adg files when kind=device-group (excludes .amxd)", async () => {
      const result = await librarySearch({ kind: "device-group" });

      expect(result.items.map((i) => i.name)).toStrictEqual(["pack_chain.adg"]);
    });

    it("returns only .amxd files when kind=m4l-device", async () => {
      const result = await librarySearch({ kind: "m4l-device" });

      expect(result.items.map((i) => i.name)).toStrictEqual(["pack_m4l.amxd"]);
    });
  });

  describe("deviceKind filter", () => {
    it("returns only instruments when deviceKind=instrument", async () => {
      const result = await librarySearch({ deviceKind: "instrument" });

      expect(result.items.map((i) => i.name)).toStrictEqual(["Operator.vst3"]);
    });

    it("returns only audio effects when deviceKind=audiofx", async () => {
      const result = await librarySearch({ deviceKind: "audiofx" });

      expect(result.items.map((i) => i.name)).toStrictEqual(["EQ Eight.vst3"]);
    });
  });

  describe("source filter", () => {
    it("returns only user library files when source=user", async () => {
      const result = await librarySearch({ source: "user" });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "user_kick.aif",
        "user_snare.wav",
      ]);
      expect(result.items.every((i) => i.source === "user")).toBe(true);
    });

    it("returns only pack files when source=pack", async () => {
      const result = await librarySearch({ source: "pack" });

      // Pin specific names in default use_count desc order so a regression
      // that returns the wrong pack items (or the right count of wrong items)
      // would fail. Includes subfolder_x/z/y from Pack One subdirectories.
      expect(result.items.map((i) => i.name)).toStrictEqual([
        "pack_kick.wav", // 100
        "pack_riff.mid", // 30
        "pack_loop.alc", // 12
        "pack_chain.adg", // 8
        "pack_clap.aif", // 5
        "pack_m4l.amxd", // 4
        "subfolder_x.wav", // 3
        "subfolder_z.wav", // 2
        "subfolder_y.wav", // 1
      ]);
      expect(result.items.every((i) => i.source === "pack")).toBe(true);
    });

    it("returns only builtin files when source=builtin", async () => {
      const result = await librarySearch({ source: "builtin" });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "EQ Eight.vst3",
        "Operator.vst3",
      ]);
    });

    it("returns no items (no SQL error) when source=sampleFolder reaches the route", async () => {
      // source=sampleFolder has no DB encoding; the tool layer normally filters
      // this out, but the route is publicly callable. The guard converts
      // the empty folder_kind list into an impossible predicate so the
      // query parses cleanly instead of producing `IN ()`.
      const result = await librarySearch({ source: "sampleFolder" });

      expect(result.items).toHaveLength(0);
      expect(result.dbAvailable).toBe(true);
    });
  });

  describe("query filter", () => {
    it("filters by name substring", async () => {
      const result = await librarySearch({ query: "kick" });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "pack_kick.wav",
        "user_kick.aif",
      ]);
    });

    it("matches case-insensitively (ASCII)", async () => {
      const result = await librarySearch({ query: "KICK" });

      expect(result.items).toHaveLength(2);
    });

    it("treats * as a multi-character wildcard", async () => {
      // `user*kick` matches user_kick.aif (the * spans "_")
      const star = await librarySearch({
        query: "user*kick",
        kind: "audio",
      });

      expect(star.items.map((i) => i.name)).toStrictEqual(["user_kick.aif"]);
    });

    it("matches SQL LIKE metacharacters literally (no longer pass through)", async () => {
      // `_` is escaped on the SQL side, so `_ick` matches only a literal
      // underscore-then-ick — which doesn't exist in the fixture. Previously
      // this returned both kicks because `_` was a single-char wildcard.
      const underscore = await librarySearch({ query: "_ick", kind: "audio" });

      expect(underscore.items).toHaveLength(0);

      // `_kick` does occur literally inside user_kick.aif and pack_kick.wav.
      const literal = await librarySearch({ query: "_kick", kind: "audio" });

      expect(literal.items.map((i) => i.name).sort()).toStrictEqual([
        "pack_kick.wav",
        "user_kick.aif",
      ]);

      // `%` is also escaped — no fixture file contains a literal '%'.
      const percent = await librarySearch({ query: "%clap", kind: "audio" });

      expect(percent.items).toHaveLength(0);
    });
  });

  describe("tags filter", () => {
    it("returns files matching a single tag", async () => {
      const result = await librarySearch({ tags: "Kick" });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "pack_kick.wav",
        "user_kick.aif",
      ]);
    });

    it("AND-joins multiple tags", async () => {
      // Kick + Punchy → only pack_kick.wav (user_kick has Kick but not Punchy)
      const result = await librarySearch({ tags: "Kick,Punchy" });

      expect(result.items.map((i) => i.name)).toStrictEqual(["pack_kick.wav"]);
    });

    it("returns empty when no file has all listed tags", async () => {
      const result = await librarySearch({ tags: "Kick,Snare Hit" });

      expect(result.items).toHaveLength(0);
    });

    it("trims and dedupes tag tokens", async () => {
      const result = await librarySearch({ tags: " Kick , Kick ,  " });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "pack_kick.wav",
        "user_kick.aif",
      ]);
    });

    it("matches tags case-insensitively (canonical casing not required)", async () => {
      const lower = await librarySearch({ tags: "kick" });
      const upper = await librarySearch({ tags: "KICK" });
      const mixed = await librarySearch({ tags: "kIcK" });

      expect(lower.items.map((i) => i.name).sort()).toStrictEqual([
        "pack_kick.wav",
        "user_kick.aif",
      ]);
      expect(upper.items.map((i) => i.name).sort()).toStrictEqual(
        lower.items.map((i) => i.name).sort(),
      );
      expect(mixed.items.map((i) => i.name).sort()).toStrictEqual(
        lower.items.map((i) => i.name).sort(),
      );
    });
  });

  describe("combined filters", () => {
    it("AND-combines kind + source + tags", async () => {
      const result = await librarySearch({
        kind: "audio",
        source: "pack",
        tags: "One Shot",
      });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "pack_clap.aif",
        "pack_kick.wav",
      ]);
    });

    it("narrows to the intersection when query + tags are both passed", async () => {
      // query "kick" matches both kicks by name; tags=Punchy narrows to the
      // one carrying that tag (pack_kick). Asserts the strict-AND combination.
      const result = await librarySearch({ query: "kick", tags: "Punchy" });

      expect(result.items.map((i) => i.name)).toStrictEqual(["pack_kick.wav"]);
    });
  });

  describe("sort", () => {
    it("defaults to use_count desc", async () => {
      const result = await librarySearch({ kind: "audio" });

      expect(result.items.map((i) => i.useCount)).toStrictEqual([
        100, 50, 25, 5, 3, 2, 1,
      ]);
    });

    it("sorts by name ASC when sort=name", async () => {
      const result = await librarySearch({ kind: "audio", sort: "name" });

      expect(result.items.map((i) => i.name)).toStrictEqual([
        "pack_clap.aif",
        "pack_kick.wav",
        "subfolder_x.wav",
        "subfolder_y.wav",
        "subfolder_z.wav",
        "user_kick.aif",
        "user_snare.wav",
      ]);
    });

    it("sorts by mod_date desc when sort=mod_date", async () => {
      const result = await librarySearch({ kind: "audio", sort: "mod_date" });

      // subfolder_z mod_date 1700001200 is the latest of all audio files
      expect(result.items[0]?.name).toBe("subfolder_z.wav");
    });

    it("breaks use_count ties by mod_date desc on the default sort", async () => {
      // Three live-set rows all have use_count=0 with distinct mod_dates;
      // they should come back newest-first (set_newest > set_middle > set_oldest)
      // rather than in arbitrary index order.
      const result = await librarySearch({ kind: "live-set" });

      expect(result.items.map((i) => i.name)).toStrictEqual([
        "set_newest.als",
        "set_middle.als",
        "set_oldest.als",
      ]);
    });
  });

  it("attaches tags to each item", async () => {
    const result = await librarySearch({ query: "user_kick" });

    expect(result.items[0]?.tags).toStrictEqual(["Kick", "One Shot"]);
  });

  it("reconstructs absolute paths", async () => {
    const result = await librarySearch({ query: "user_kick" });

    expect(result.items[0]?.path).toBe(
      "/Users/test/Music/Ableton/User Library/user_kick.aif",
    );
  });

  describe("verifyPaths", () => {
    it("does not set pathExists or stat the disk when verifyPaths is off", async () => {
      const result = await librarySearch({ query: "user_kick" });

      expect(result.items[0]?.pathExists).toBeUndefined();
      expect(vi.mocked(stat)).not.toHaveBeenCalled();
    });

    it("sets pathExists: true for files that exist on disk", async () => {
      vi.mocked(stat).mockResolvedValue({} as never);

      const result = await librarySearch({ kind: "audio", verifyPaths: true });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((i) => i.pathExists === true)).toBe(true);
    });

    it("sets pathExists: false for files missing from disk", async () => {
      vi.mocked(stat).mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );

      const result = await librarySearch({ kind: "audio", verifyPaths: true });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((i) => i.pathExists === false)).toBe(true);
    });

    it("reports existence independently per path", async () => {
      const present = "/Users/test/Music/Ableton/User Library/user_kick.aif";

      vi.mocked(stat).mockImplementation(((p: string) =>
        p === present
          ? Promise.resolve({})
          : Promise.reject(new Error("ENOENT"))) as never);

      const result = await librarySearch({ kind: "audio", verifyPaths: true });
      const kick = result.items.find((i) => i.name === "user_kick.aif");
      const others = result.items.filter((i) => i.name !== "user_kick.aif");

      expect(kick?.pathExists).toBe(true);
      expect(others.every((i) => i.pathExists === false)).toBe(true);
    });
  });

  it("surfaces the immediate parent folder name on each item", async () => {
    const userKick = await librarySearch({ query: "user_kick" });
    const packKick = await librarySearch({ query: "pack_kick" });

    expect(userKick.items[0]?.folder).toBe("User Library");
    expect(packKick.items[0]?.folder).toBe("Pack One");
  });

  it("respects limit", async () => {
    const result = await librarySearch({ kind: "audio", limit: 2 });

    expect(result.items).toHaveLength(2);
  });

  it("clamps invalid limits to default", async () => {
    const result = await librarySearch({ kind: "audio", limit: -1 });

    expect(result.items.length).toBeGreaterThan(0);
  });

  describe("inFolder filter", () => {
    it("returns only immediate children of the resolved folder", async () => {
      // Pack One/SubA contains subfolder_x.wav and subfolder_y.wav (not subfolder_z)
      const result = await librarySearch({
        inFolder: "/Users/test/Music/Ableton/Factory Packs/Pack One/SubA",
      });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "subfolder_x.wav",
        "subfolder_y.wav",
      ]);
    });

    it("does not recurse into subdirectories", async () => {
      // Pack One contains SubA and SubB subdirs plus pack audio files.
      // With inFolder pointing at Pack One, we get only direct children
      // (pack_kick, pack_clap, etc., SubA folder, SubB folder) — NOT
      // subfolder_x/y/z which live one level deeper.
      const result = await librarySearch({
        inFolder: "/Users/test/Music/Ableton/Factory Packs/Pack One",
        kind: "audio",
      });

      const names = result.items.map((i) => i.name).sort();

      expect(names).toContain("pack_kick.wav");
      expect(names).not.toContain("subfolder_x.wav");
      expect(names).not.toContain("subfolder_y.wav");
      expect(names).not.toContain("subfolder_z.wav");
    });

    it("composes with kind filter", async () => {
      // SubA folder has only wav audio files; filter kind=audio should work
      const result = await librarySearch({
        inFolder: "/Users/test/Music/Ableton/Factory Packs/Pack One/SubA",
        kind: "audio",
      });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "subfolder_x.wav",
        "subfolder_y.wav",
      ]);
    });

    it("composes with tags filter", async () => {
      // Only subfolder_y.wav has the SubOnly tag in SubA
      const result = await librarySearch({
        inFolder: "/Users/test/Music/Ableton/Factory Packs/Pack One/SubA",
        tags: "SubOnly",
      });

      expect(result.items.map((i) => i.name)).toStrictEqual([
        "subfolder_y.wav",
      ]);
    });

    it("returns empty results for an unresolvable path", async () => {
      const result = await librarySearch({
        inFolder: "/Users/test/Music/Ableton/NonExistentFolder",
      });

      expect(result.dbAvailable).toBe(true);
      expect(result.items).toHaveLength(0);
    });

    it("normalizes trailing slash (with and without produce the same results)", async () => {
      const withSlash = await librarySearch({
        inFolder: "/Users/test/Music/Ableton/Factory Packs/Pack One/SubA/",
      });
      const withoutSlash = await librarySearch({
        inFolder: "/Users/test/Music/Ableton/Factory Packs/Pack One/SubA",
      });

      expect(withSlash.items.map((i) => i.name).sort()).toStrictEqual(
        withoutSlash.items.map((i) => i.name).sort(),
      );
    });
  });
});
