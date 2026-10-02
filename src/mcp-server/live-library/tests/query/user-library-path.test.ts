// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findUserLibraryPath } from "../../query/user-library-path.ts";

const { findLiveFilesDbPath } = vi.hoisted(() => ({
  findLiveFilesDbPath: vi.fn<() => Promise<string | null>>(),
}));

// The real lookup reads Live's database folder under the developer's home,
// which a test can't stand in for. Everything else here is a real SQLite file.
vi.mock(import("../../live-db-path.ts"), () => ({
  findLiveFilesDbPath,
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
  setRunningLiveMajor: vi.fn(),
}));

let scratchDir: string;

/**
 * Write a files DB holding a folder chain and the given places rows.
 *
 * @param places - `[file_id, folder_kind]` pairs for the places table
 * @returns Path to the DB
 */
function writeDb(places: [number, number][]): string {
  const dbPath = join(scratchDir, "Live-files-12300.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE files (file_id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT);
    CREATE TABLE places (file_id INTEGER PRIMARY KEY, folder_kind INTEGER);
  `);

  for (const [fileId, parentId, name] of [
    [1, 0, "/"],
    [2, 1, "Users"],
    [3, 2, "someone"],
    [11, 3, "User Library"],
  ] as [number, number, string][]) {
    db.prepare("INSERT INTO files VALUES (?, ?, ?)").run(
      fileId,
      parentId,
      name,
    );
  }

  for (const [fileId, folderKind] of places) {
    db.prepare("INSERT INTO places VALUES (?, ?)").run(fileId, folderKind);
  }

  db.close();

  return dbPath;
}

describe("findUserLibraryPath", () => {
  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "ppal-user-library-"));
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it("resolves the folder_kind=1 place to an absolute path", async () => {
    findLiveFilesDbPath.mockResolvedValue(
      writeDb([
        [2, 3],
        [11, 1],
      ]),
    );

    expect(await findUserLibraryPath()).toBe("/Users/someone/User Library");
  });

  it("is null when no place is the User Library", async () => {
    findLiveFilesDbPath.mockResolvedValue(writeDb([[2, 3]]));

    expect(await findUserLibraryPath()).toBeNull();
  });

  it("is null when the User Library place has no file row", async () => {
    findLiveFilesDbPath.mockResolvedValue(writeDb([[99, 1]]));

    expect(await findUserLibraryPath()).toBeNull();
  });

  it("is null when there is no database to read", async () => {
    findLiveFilesDbPath.mockResolvedValue(null);

    expect(await findUserLibraryPath()).toBeNull();
  });

  it("is null rather than throwing when the database can't be queried", async () => {
    findLiveFilesDbPath.mockResolvedValue(join(scratchDir, "missing.db"));

    expect(await findUserLibraryPath()).toBeNull();
  });
});
