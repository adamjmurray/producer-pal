// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fourCC } from "../../library-filters.ts";
import { listCategories } from "../../list-categories.ts";
import { listTags } from "../../list-tags.ts";
import { findDuplicates } from "../../query/find-duplicates.ts";
import { findSimilar } from "../../query/find-similar.ts";
import { librarySearch } from "../../query/library-search.ts";
import {
  featureBlob,
  KICK_VECTOR,
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

const USER_LIBRARY = "/Users/test/Music/Ableton/User Library";
const PRESET_FOLDER = "/Presets";
const SEED = `${USER_LIBRARY}/user_kick.aif`;
const HIDDEN = [
  "serum_boom.wav",
  "serum_kick.wav",
  "serum_kick_copy.wav",
  "serum_raw.wav",
];
const LINKED = [
  "linked_boom.aupreset",
  "linked_kick.aupreset",
  "linked_vst2.vstpreset",
];
const NOTE_TAIL =
  "in plug-in preset folders left out; source: preset-folder includes them";
const NOTE = (count: string): string => `${count} ${NOTE_TAIL}`;
// find-similar and find-duplicates can't say how many.
const UNCOUNTED_NOTE = `Files ${NOTE_TAIL}`;

/**
 * Add a preset folder (Place 400, kind 5) with the files Live hides there: two
 * copies of the seed kick, another sound (with an Ableton device_id), a file
 * with its flags bit clear, and a subfolder. It also holds an AU, a VST3 and a
 * VST2 preset linked to a plug-in, which Live lists. The AU and VST3 ones have
 * audio data so find-similar and find-duplicates see them.
 *
 * @param db - Open writable fixture DB
 */
function addPresetFolder(db: DatabaseSync): void {
  const wav = fourCC("wav-");
  const aupr = fourCC("aupr");
  const file = db.prepare(
    `INSERT INTO files (file_id, parent_id, file_type, file_kind, name, place_id, flags, device_id)
     VALUES (?, 400, ?, 4, ?, 400, ?, ?)`,
  );
  const fe = db.prepare(
    "INSERT INTO fe_values (file_id, data, hash) VALUES (?, ?, ?)",
  );

  db.exec(`INSERT INTO files (file_id, parent_id, file_type, file_kind, name)
           VALUES (400, 1, ${fourCC("fldr")}, 512, 'Presets'),
                  (9007, 1, ${fourCC("keyw")}, 0, 'PresetOnly'),
                  (9008, 1, ${fourCC("keyw")}, 0, 'LinkedOnly')`);
  db.exec(
    "INSERT INTO places (file_id, folder_kind, name) VALUES (400, 5, 'x')",
  );
  file.run(7001, wav, "serum_kick.wav", 1027, "");
  file.run(7002, wav, "serum_kick_copy.wav", 1027, null);
  file.run(7003, wav, "serum_boom.wav", 1027, "device:ableton:audiofx:x");
  file.run(7004, wav, "serum_raw.wav", 1026, "");
  file.run(7005, aupr, "linked_kick.aupreset", 3, "device:au:audiofx:1:2:3");
  file.run(7006, aupr, "linked_boom.aupreset", 3, "device:vst3:audiofx:4:5");
  file.run(
    7007,
    fourCC("vstp"),
    "linked_vst2.vstpreset",
    3,
    "device:vst:instr:6:7",
  );
  db.exec(`INSERT INTO files (file_id, parent_id, file_type, file_kind, name, place_id)
           VALUES (410, 400, ${fourCC("fldr")}, 512, 'PresetSub', 400)`);
  fe.run(7001, featureBlob(KICK_VECTOR), 700);
  fe.run(7002, featureBlob(KICK_VECTOR), 700);
  fe.run(7003, featureBlob(KICK_VECTOR.map((x) => x + 1)), 7003);
  fe.run(7005, featureBlob(KICK_VECTOR), 700);
  fe.run(7006, featureBlob(KICK_VECTOR.map((x) => x + 2)), 7006);

  const tag = db.prepare(
    "INSERT INTO keywords (file_id, keyw_id, is_auto) VALUES (?, ?, 0)",
  );

  tag.run(7001, 9001); // Kick
  tag.run(7001, 9007);
  tag.run(7005, 9008);
  db.exec(`INSERT INTO metadata_values (id, value)
           VALUES (300, 'Hidden|Only'), (301, 'Linked|Only')`);

  const meta = db.prepare(
    "INSERT INTO metadata (file_id, key, value_id) VALUES (?, ?, ?)",
  );

  meta.run(7001, fourCC("CKey"), 300);
  meta.run(7005, fourCC("CKey"), 301);
}

describe("plug-in preset folders", () => {
  setupLibraryFixtureLifecycle(dbPathMod, addPresetFolder);

  beforeEach(() => {
    vi.mocked(stalenessMod.detectStalenessRisk).mockResolvedValue(undefined);
  });

  describe("files Live hides are left out by default", () => {
    it("search leaves them out", async () => {
      const result = await librarySearch({ query: "serum" });

      expect(result.items).toStrictEqual([]);
    });

    it("search lists everything when browsing the folder", async () => {
      const result = await librarySearch({ inFolder: PRESET_FOLDER });

      expect(result.items.map((i) => i.name).toSorted()).toStrictEqual(
        [...HIDDEN, ...LINKED, "PresetSub"].toSorted(),
      );
    });

    it("findSimilar leaves them out", async () => {
      const result = await findSimilar({ similarTo: SEED });
      const names = result.items.map((i) => i.name);

      expect(names).not.toContain("serum_boom.wav");
      expect(names).toContain("linked_boom.aupreset");
    });

    it("findDuplicates leaves them out", async () => {
      const result = await findDuplicates({});
      const names = result.groups.flatMap((g) => g.items.map((i) => i.name));

      expect(names).not.toContain("serum_kick.wav");
      expect(names).not.toContain("serum_kick_copy.wav");
    });

    it("listTags and listCategories leave out what only they carry", async () => {
      const tags = await listTags({});
      const top = await listCategories({});
      const drums = await listCategories({ category: "Drums" });

      expect(tags.tags.map((t) => t.name)).not.toContain("PresetOnly");
      expect(tags.tags.find((t) => t.name === "Kick")?.count).toBe(2);
      expect(top.categories?.map((c) => c.name)).not.toContain("Hidden");
      expect(drums.tags?.find((t) => t.name === "Kick")?.count).toBe(2);
    });
  });

  describe("plug-in presets Live linked to a plug-in are listed", () => {
    it("search lists them as plugin", async () => {
      const result = await librarySearch({ query: "linked" });

      expect(result.items.map((i) => i.name).toSorted()).toStrictEqual(LINKED);
      expect(result.items.every((i) => i.source === "plugin")).toBe(true);
      expect(result).not.toHaveProperty("note");
    });

    it("findSimilar and findDuplicates list them as plugin", async () => {
      const similar = await findSimilar({ similarTo: SEED });
      const dups = await findDuplicates({});
      const group = dups.groups.find((g) =>
        g.items.some((i) => i.name === "linked_kick.aupreset"),
      );

      expect(
        similar.items.find((i) => i.name === "linked_boom.aupreset")?.source,
      ).toBe("plugin");
      expect(group?.items.map((i) => i.name).toSorted()).toStrictEqual([
        "linked_kick.aupreset",
        "pack_kick.wav",
        "user_kick.aif",
      ]);
      expect(
        group?.items.find((i) => i.name === "linked_kick.aupreset")?.source,
      ).toBe("plugin");
    });

    it("listTags and listCategories count them", async () => {
      const tags = await listTags({});
      const top = await listCategories({});

      expect(tags.tags.find((t) => t.name === "LinkedOnly")?.count).toBe(1);
      expect(top.categories?.map((c) => c.name)).toContain("Linked");
    });
  });

  describe("a preset place's folders", () => {
    it("the root isn't listed or counted, but its subfolders are counted", async () => {
      const result = await librarySearch({ kind: "folder", query: "Preset" });

      expect(result.items).toStrictEqual([]);
      expect(result.note).toBe(NOTE("1 matching file"));
    });

    it("source preset-folder returns the subfolders, not the root", async () => {
      const result = await librarySearch({
        kind: "folder",
        source: "preset-folder",
      });

      expect(result.items.map((i) => i.name)).toStrictEqual(["PresetSub"]);
    });
  });

  describe("source: plugin", () => {
    it("matches the linked presets, and no hidden file", async () => {
      const result = await librarySearch({ source: "plugin" });

      expect(result.items.map((i) => i.name).toSorted()).toStrictEqual(LINKED);
    });

    it("findSimilar and findDuplicates take the same files", async () => {
      const similar = await findSimilar({ similarTo: SEED, source: "plugin" });
      const dups = await findDuplicates({ source: "plugin" });

      expect(similar.items.map((i) => i.name)).toStrictEqual([
        "linked_boom.aupreset",
      ]);
      expect(dups.groups).toStrictEqual([]);
    });
  });

  describe("source: preset-folder", () => {
    it("search lists only the hidden files, as preset-folder, flagged or not", async () => {
      const result = await librarySearch({ source: "preset-folder" });

      expect(result.items.map((i) => i.name).toSorted()).toStrictEqual([
        "PresetSub",
        ...HIDDEN,
      ]);
      expect(result.items.every((i) => i.source === "preset-folder")).toBe(
        true,
      );
    });

    it("search composes with other filters", async () => {
      const result = await librarySearch({
        source: "preset-folder",
        tags: "Kick",
      });

      expect(result.items.map((i) => i.name)).toStrictEqual(["serum_kick.wav"]);
    });

    it("other sources leave them out", async () => {
      const result = await librarySearch({ source: "user", query: "serum" });

      expect(result.items).toStrictEqual([]);
    });

    it("findSimilar ranks only the hidden files", async () => {
      const result = await findSimilar({
        similarTo: SEED,
        source: "preset-folder",
      });

      // serum_kick and its copy share the seed's audio, so they're skipped.
      expect(result.items.map((i) => i.name)).toStrictEqual(["serum_boom.wav"]);
      expect(result.items[0]?.source).toBe("preset-folder");
    });

    it("findDuplicates groups only the hidden files", async () => {
      const result = await findDuplicates({ source: "preset-folder" });

      expect(
        result.groups.map((g) => g.items.map((i) => i.name).toSorted()),
      ).toStrictEqual([["serum_kick.wav", "serum_kick_copy.wav"]]);
      expect(result.groups[0]?.items[0]?.source).toBe("preset-folder");
    });
  });

  describe("note on what the default left out", () => {
    it("search counts the matching files, not the ones Live's views hide", async () => {
      const result = await librarySearch({ query: "serum" });

      expect(result.note).toBe(NOTE("3 matching files"));
    });

    it("search says 'file' for one", async () => {
      const result = await librarySearch({ query: "serum_boom" });

      expect(result.note).toBe(NOTE("1 matching file"));
    });

    it("search counts under the same filters", async () => {
      const result = await librarySearch({ query: "kick", kind: "audio" });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.note).toBe(NOTE("2 matching files"));
    });

    it("search doesn't count the linked presets it listed", async () => {
      const result = await librarySearch({ query: "kick" });

      expect(result.items.map((i) => i.name)).toContain("linked_kick.aupreset");
      expect(result.note).toBe(NOTE("2 matching files"));
    });

    it("search has none when nothing was left out", async () => {
      const result = await librarySearch({ query: "snare" });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty("note");
    });

    it("search has none when a source or folder was given", async () => {
      const bySource = await librarySearch({ query: "kick", source: "user" });
      const byFolder = await librarySearch({
        query: "kick",
        inFolder: USER_LIBRARY,
      });

      expect(bySource).not.toHaveProperty("note");
      expect(byFolder).not.toHaveProperty("note");
    });

    it("findSimilar says it left analyzed files out, without a count", async () => {
      const result = await findSimilar({ similarTo: SEED });

      expect(result.note).toBe(UNCOUNTED_NOTE);
    });

    it("findSimilar has none when nothing matched, or a source or folder was given", async () => {
      const none = await findSimilar({ similarTo: SEED, query: "snare" });
      const bySource = await findSimilar({ similarTo: SEED, source: "user" });
      const byFolder = await findSimilar({
        similarTo: SEED,
        inFolder: USER_LIBRARY,
      });

      expect(none.items.length).toBeGreaterThan(0);
      expect(none).not.toHaveProperty("note");
      expect(bySource).not.toHaveProperty("note");
      expect(byFolder).not.toHaveProperty("note");
    });

    it("findDuplicates says it left analyzed files out, without a count", async () => {
      const result = await findDuplicates({});

      expect(result.note).toBe(UNCOUNTED_NOTE);
    });

    it("findDuplicates has none when nothing matched, or a source or folder was given", async () => {
      const none = await findDuplicates({ query: "snare" });
      const bySource = await findDuplicates({ source: "user" });
      const byFolder = await findDuplicates({ inFolder: USER_LIBRARY });

      expect(none).not.toHaveProperty("note");
      expect(bySource).not.toHaveProperty("note");
      expect(byFolder).not.toHaveProperty("note");
    });
  });
});
