// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fourCC } from "../../library-filters.ts";
import { browserNamedPackPath } from "../../query/pack-folder-names.ts";

const { findLiveFilesDbPath } = vi.hoisted(() => ({
  findLiveFilesDbPath: vi.fn<() => Promise<string | null>>(),
}));

vi.mock(import("../../live-db-path.ts"), () => ({
  findLiveFilesDbPath,
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
  setRunningLiveMajor: vi.fn(),
}));

const FLDR = fourCC("fldr");

const PACKS = "/Users/me/Music/Ableton/Factory Packs";
const ANGELICALS = `${PACKS}/AAS Angelicals-1/Pad/String Machine.adg`;

let dir: string;
let dbPath: string;

/**
 * Write a files DB: pack "AAS Angelicals" lives in the folder "AAS Angelicals-1",
 * "Drum Essentials" in a folder of its own name, and the Current Project place
 * has a folder name unlike its own.
 *
 * @param withPlaceNames - Whether the places table has a name column
 * @returns Path to the DB
 */
function writeDb(withPlaceNames: boolean): string {
  const path = join(dir, withPlaceNames ? "named.db" : "unnamed.db");
  const db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE files (file_id INTEGER PRIMARY KEY, parent_id INTEGER,
      name TEXT, file_type INTEGER);
    CREATE TABLE places (file_id INTEGER PRIMARY KEY, folder_kind INTEGER
      ${withPlaceNames ? ", name TEXT" : ""});
  `);

  const rows: Array<[number, number, string]> = [
    [1, 0, "/"],
    [2, 1, "Users"],
    [3, 2, "me"],
    [4, 3, "Music"],
    [5, 4, "Ableton"],
    [6, 5, "Factory Packs"],
    [11, 6, "AAS Angelicals-1"],
    [12, 6, "Drum Essentials"],
    [13, 6, "Looplet"],
    [14, 5, "Temp Project"],
    [20, 11, "Pad"],
    [21, 20, "String Machine.adg"],
  ];

  for (const [id, parent, name] of rows) {
    db.prepare("INSERT INTO files VALUES (?, ?, ?, ?)").run(
      id,
      parent,
      name,
      FLDR,
    );
  }

  const places: Array<[number, number, string | null]> = [
    [11, 0, "AAS Angelicals"],
    [12, 0, "Drum Essentials"],
    [13, 0, null],
    [14, 4, "Current Project"],
  ];

  for (const [id, kind, name] of places) {
    if (withPlaceNames) {
      db.prepare("INSERT INTO places VALUES (?, ?, ?)").run(id, kind, name);
    } else {
      db.prepare("INSERT INTO places VALUES (?, ?)").run(id, kind);
    }
  }

  db.close();

  return path;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pack-folder-names-"));
  dbPath = writeDb(true);
  findLiveFilesDbPath.mockResolvedValue(dbPath);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("browserNamedPackPath", () => {
  it("names a pack's folder as the browser lists the pack", async () => {
    expect(await browserNamedPackPath(ANGELICALS)).toBe(
      `${PACKS}/AAS Angelicals/Pad/String Machine.adg`,
    );
  });

  it("matches the folder in any case and with backslashes", async () => {
    expect(
      await browserNamedPackPath(
        "/users/me/music/ableton/factory packs/aas angelicals-1\\Pad\\x.adg",
      ),
    ).toBe(`${PACKS}/AAS Angelicals/Pad/x.adg`);
  });

  it("leaves a pack whose folder has the pack's name", async () => {
    const path = `${PACKS}/Drum Essentials/Drums/Kit.adg`;

    expect(await browserNamedPackPath(path)).toBe(path);
  });

  it("leaves a pack with no name in the library", async () => {
    const path = `${PACKS}/Looplet/Kit.adg`;

    expect(await browserNamedPackPath(path)).toBe(path);
  });

  it("leaves a place that isn't a pack", async () => {
    const path = "/Users/me/Music/Ableton/Temp Project/Kit.adg";

    expect(await browserNamedPackPath(path)).toBe(path);
  });

  it("leaves a file outside the renamed folder, and the folder itself", async () => {
    const sibling = `${PACKS}/AAS Angelicals-10/Kit.adg`;
    const folder = `${PACKS}/AAS Angelicals-1`;

    expect(await browserNamedPackPath(sibling)).toBe(sibling);
    expect(await browserNamedPackPath(folder)).toBe(folder);
  });

  it("returns the path as given when there is no library", async () => {
    findLiveFilesDbPath.mockResolvedValue(null);

    expect(await browserNamedPackPath(ANGELICALS)).toBe(ANGELICALS);
  });

  it("returns the path as given when the library has no place names", async () => {
    findLiveFilesDbPath.mockResolvedValue(writeDb(false));

    expect(await browserNamedPackPath(ANGELICALS)).toBe(ANGELICALS);
  });
});
