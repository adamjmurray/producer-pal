// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
const LEFT_OUT = ["flagged_kick.wav", "other_install_kick.wav"];

/**
 * Add two User Library copies of the seed kick (same audio hash as
 * user_kick.aif) that Live's library search leaves out: one with the lowest
 * flags bit clear, one outside every browser Place.
 *
 * @param db - Open writable fixture DB
 */
function addLeftOutKicks(db: DatabaseSync): void {
  const file = db.prepare(
    `INSERT INTO files (file_id, parent_id, file_type, file_kind, name, place_id, flags)
     VALUES (?, 100, ?, 4, ?, ?, ?)`,
  );
  const fe = db.prepare(
    "INSERT INTO fe_values (file_id, data, hash) VALUES (?, ?, 700)",
  );
  const wav = fourCC("wav-");

  file.run(6001, wav, "flagged_kick.wav", 100, 1026);
  fe.run(6001, featureBlob(KICK_VECTOR));
  file.run(6002, wav, "other_install_kick.wav", 0, 1027);
  fe.run(6002, featureBlob(KICK_VECTOR));
  // Its own audio, so findSimilar's duplicate collapsing can't hide it.
  file.run(6003, wav, "flagged_boom.wav", 100, 1026);
  db.prepare(
    "INSERT INTO fe_values (file_id, data, hash) VALUES (6003, ?, 6003)",
  ).run(featureBlob(KICK_VECTOR.map((x) => x + 1)));
  // A flagged reverb IR, like Hybrid Reverb's.
  file.run(6004, wav, "flagged_ir.wav", 100, 1026);
  db.prepare(
    `INSERT INTO files (file_id, parent_id, file_type, name)
     VALUES (9006, 1, ?, 'Impulse Response')`,
  ).run(fourCC("keyw"));

  const tag = db.prepare(
    "INSERT INTO keywords (file_id, keyw_id, is_auto) VALUES (?, ?, 0)",
  );

  tag.run(6001, 9001); // Kick
  tag.run(6002, 9001);
  tag.run(6004, 9006);
  db.exec(`INSERT INTO metadata_values (id, value)
           VALUES (100, 'Hidden|Only'), (101, 'Elsewhere|Only'),
                  (102, 'Reverb|Impulse Response')`);

  const meta = db.prepare(
    "INSERT INTO metadata (file_id, key, value_id) VALUES (?, ?, ?)",
  );

  meta.run(6001, fourCC("CKey"), 100);
  meta.run(6002, fourCC("CKey"), 101);
  meta.run(6004, fourCC("CKey"), 102);
}

// find-similar.test.ts covers findSimilar's library-wide case.
describe("Live's library listing rules", () => {
  setupLibraryFixtureLifecycle(dbPathMod, addLeftOutKicks);

  beforeEach(() => {
    vi.mocked(stalenessMod.detectStalenessRisk).mockResolvedValue(undefined);
  });

  it("search leaves out flagged and Place-less files library-wide", async () => {
    const result = await librarySearch({ query: "kick" });
    const names = result.items.map((i) => i.name);

    expect(names).toContain("user_kick.aif");
    expect(names).not.toContain(LEFT_OUT[0]);
    expect(names).not.toContain(LEFT_OUT[1]);
  });

  it("search lists them inside a folder, as Live's folder view does", async () => {
    const result = await librarySearch({
      query: "kick",
      inFolder: USER_LIBRARY,
    });

    expect(result.items.map((i) => i.name)).toStrictEqual(
      expect.arrayContaining(LEFT_OUT),
    );
  });

  it("search keeps flagged files when a source filter picks the Place", async () => {
    const result = await librarySearch({ query: "kick", source: "user" });
    const names = result.items.map((i) => i.name);

    expect(names).toContain("flagged_kick.wav");
    expect(names).not.toContain("other_install_kick.wav");
  });

  it("search keeps flagged IRs when asked for IRs, by type or tag", async () => {
    const byType = await librarySearch({ type: "impulse-response" });
    const byTag = await librarySearch({ tags: "impulse response" });
    const byName = await librarySearch({ query: "flagged_ir" });
    const tags = await listTags({});

    expect(byType.items.map((i) => i.name)).toContain("flagged_ir.wav");
    expect(byTag.items.map((i) => i.name)).toStrictEqual(["flagged_ir.wav"]);
    expect(byName.items).toStrictEqual([]);
    const reverb = await listCategories({ category: "Reverb" });

    // Tag counts match what a search for the tag returns.
    expect(tags.tags.find((t) => t.name === "Impulse Response")?.count).toBe(1);
    expect(reverb.tags).toStrictEqual([{ name: "Impulse Response", count: 1 }]);
  });

  it("search still finds a Place's own root folder", async () => {
    const packs = await librarySearch({ kind: "folder", query: "Pack One" });
    const user = await librarySearch({ kind: "folder", query: "User Library" });

    expect(packs.items.map((i) => i.name)).toContain("Pack One");
    expect(user.items.map((i) => i.name)).toContain("User Library");
  });

  it("listTags and listCategories count only what search lists", async () => {
    const tags = await listTags({});
    const top = await listCategories({});
    const drums = await listCategories({ category: "Drums" });

    expect(tags.tags.find((t) => t.name === "Kick")?.count).toBe(2);
    expect(top.categories?.map((c) => c.name)).not.toContain("Hidden");
    expect(top.categories?.map((c) => c.name)).not.toContain("Elsewhere");
    expect(drums.tags?.find((t) => t.name === "Kick")?.count).toBe(2);
  });

  it("findDuplicates leaves them out of library-wide groups", async () => {
    const result = await findDuplicates({});
    const kickGroup = result.groups.find((g) =>
      g.items.some((i) => i.name === "user_kick.aif"),
    );

    expect(kickGroup?.items.map((i) => i.name).toSorted()).toStrictEqual([
      "pack_kick.wav",
      "user_kick.aif",
    ]);
  });

  it("findDuplicates groups them inside a folder", async () => {
    const result = await findDuplicates({ inFolder: USER_LIBRARY });

    expect(
      result.groups.map((g) => g.items.map((i) => i.name).toSorted()),
    ).toStrictEqual([[...LEFT_OUT, "user_kick.aif"].toSorted()]);
  });

  it("findSimilar compares them inside a folder", async () => {
    const result = await findSimilar({
      similarTo: `${USER_LIBRARY}/user_kick.aif`,
      inFolder: USER_LIBRARY,
    });

    expect(result.items.map((i) => i.name)).toContain("flagged_boom.wav");
  });
});
