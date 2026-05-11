// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
import { librarySearch } from "../library-search.ts";
import {
  createLibraryFixture,
  type LibraryFixture,
} from "./library-fixture.ts";

vi.mock(import("../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../live-db-path.ts");

let fixture: LibraryFixture;

describe("librarySearch", () => {
  beforeAll(() => {
    fixture = createLibraryFixture();
  });

  beforeEach(() => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(fixture.dbPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    fixture.cleanup();
  });

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

      expect(result.items.map((i) => i.kind)).toStrictEqual([
        "audio",
        "audio",
        "audio",
        "audio",
      ]);
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

      expect(result.items.every((i) => i.source === "pack")).toBe(true);
      expect(result.items).toHaveLength(6);
    });

    it("returns only builtin files when source=builtin", async () => {
      const result = await librarySearch({ source: "builtin" });

      expect(result.items.map((i) => i.name).sort()).toStrictEqual([
        "EQ Eight.vst3",
        "Operator.vst3",
      ]);
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
  });

  describe("sort", () => {
    it("defaults to use_count desc", async () => {
      const result = await librarySearch({ kind: "audio" });

      expect(result.items.map((i) => i.useCount)).toStrictEqual([
        100, 50, 25, 5,
      ]);
    });

    it("sorts by name ASC when sort=name", async () => {
      const result = await librarySearch({ kind: "audio", sort: "name" });

      expect(result.items.map((i) => i.name)).toStrictEqual([
        "pack_clap.aif",
        "pack_kick.wav",
        "user_kick.aif",
        "user_snare.wav",
      ]);
    });

    it("sorts by mod_date desc when sort=mod_date", async () => {
      const result = await librarySearch({ kind: "audio", sort: "mod_date" });

      // pack_clap mod_date 1700000300 is the latest of the 4 audio files
      expect(result.items[0]?.name).toBe("pack_clap.aif");
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

  it("respects limit", async () => {
    const result = await librarySearch({ kind: "audio", limit: 2 });

    expect(result.items).toHaveLength(2);
  });

  it("clamps invalid limits to default", async () => {
    const result = await librarySearch({ kind: "audio", limit: -1 });

    expect(result.items.length).toBeGreaterThan(0);
  });
});
