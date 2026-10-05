// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findUserLibraryPath } from "../../query/user-library-path.ts";

const { findLiveFilesDbPath, home } = vi.hoisted(() => ({
  findLiveFilesDbPath: vi.fn<() => Promise<string | null>>(),
  home: { dir: "" },
}));

// The real lookups read Live's folders under the developer's home, which a
// test can't stand in for. Everything else here is a real file.
vi.mock(import("../../live-db-path.ts"), () => ({
  findLiveFilesDbPath,
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
  setRunningLiveMajor: vi.fn(),
}));

vi.mock(import("node:os"), async (importOriginal) => ({
  ...(await importOriginal()),
  homedir: () => home.dir,
}));

const originalPlatform = process.platform;
const originalAppData = process.env.APPDATA;
let scratchDir: string;

/**
 * @param platform - Platform to pretend to be
 */
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform });
}

/**
 * @param path - Folder to create
 * @returns The same path
 */
function folder(path: string): string {
  mkdirSync(path, { recursive: true });

  return path;
}

/**
 * Write a files DB whose places rows point into a folder chain for `target`.
 *
 * @param target - Absolute path the chain spells out; its leaf is file_id 99
 * @param places - `[file_id, folder_kind]` pairs for the places table
 * @returns Path to the DB
 */
function writeDb(target: string, places: [number, number][]): string {
  const dbPath = join(scratchDir, "Live-files-12300.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE files (file_id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT);
    CREATE TABLE places (file_id INTEGER PRIMARY KEY, folder_kind INTEGER);
  `);

  const segments = target.split("/").filter(Boolean);
  const insert = db.prepare("INSERT INTO files VALUES (?, ?, ?)");

  insert.run(1, 0, "/");

  for (const [i, name] of segments.entries()) {
    const isLeaf = i === segments.length - 1;

    insert.run(isLeaf ? 99 : i + 2, i + 1, name);
  }

  for (const [fileId, folderKind] of places) {
    db.prepare("INSERT INTO places VALUES (?, ?)").run(fileId, folderKind);
  }

  db.close();

  return dbPath;
}

/**
 * Write a Library.cfg naming a User Library.
 *
 * @param file - Where to write it
 * @param parent - The ProjectPath value, already XML-escaped
 * @param mtime - Modified time, in seconds
 */
function writeCfg(file: string, parent: string, mtime = 1000): void {
  folder(dirname(file));
  writeFileSync(
    file,
    `<Ableton><ContentLibrary><UserLibrary><LibraryProject Id="0">
      <ProjectName Value="User Library" />
      <ProjectPath Value="${parent}" />
    </LibraryProject></UserLibrary></ContentLibrary></Ableton>`,
  );
  utimesSync(file, mtime, mtime);
}

/**
 * @param version - Live version in the folder name
 * @returns The macOS Library.cfg path for that version under the fake home
 */
function macCfg(version: string): string {
  return join(
    home.dir,
    "Library/Preferences/Ableton",
    `Live ${version}`,
    "Library.cfg",
  );
}

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "ppal-user-library-"));
  home.dir = folder(join(scratchDir, "home"));
  findLiveFilesDbPath.mockResolvedValue(null);
  setPlatform("darwin");
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
  setPlatform(originalPlatform);

  if (originalAppData == null) {
    delete process.env.APPDATA;
  } else {
    process.env.APPDATA = originalAppData;
  }
});

describe("findUserLibraryPath from the browser database", () => {
  it("resolves the folder_kind=1 place to an absolute path", async () => {
    const library = folder(join(scratchDir, "Lib", "User Library"));

    findLiveFilesDbPath.mockResolvedValue(
      writeDb(library, [
        [2, 3],
        [99, 1],
      ]),
    );

    expect(await findUserLibraryPath()).toBe(library);
  });

  it("wins over the preferences", async () => {
    const library = folder(join(scratchDir, "Lib", "User Library"));

    folder(join(scratchDir, "Other", "User Library"));
    writeCfg(macCfg("12.4"), join(scratchDir, "Other"));
    findLiveFilesDbPath.mockResolvedValue(writeDb(library, [[99, 1]]));

    expect(await findUserLibraryPath()).toBe(library);
  });

  it("is skipped when its folder no longer exists", async () => {
    const moved = folder(join(scratchDir, "Moved", "User Library"));

    writeCfg(macCfg("12.4"), join(scratchDir, "Moved"));
    findLiveFilesDbPath.mockResolvedValue(
      writeDb(join(scratchDir, "Gone", "User Library"), [[99, 1]]),
    );

    expect(await findUserLibraryPath()).toBe(moved);
  });

  it.each([
    ["no place is the User Library", [[2, 3]]],
    ["the User Library place has no file row", [[50, 1]]],
  ] as [string, [number, number][]][])("is null when %s", async (_, places) => {
    findLiveFilesDbPath.mockResolvedValue(
      writeDb(folder(join(scratchDir, "Lib")), places),
    );

    expect(await findUserLibraryPath()).toBeNull();
  });

  it("is null when there is no database to read", async () => {
    expect(await findUserLibraryPath()).toBeNull();
  });

  it("is null rather than throwing when the database can't be queried", async () => {
    findLiveFilesDbPath.mockResolvedValue(join(scratchDir, "missing.db"));

    expect(await findUserLibraryPath()).toBeNull();
  });
});

describe("findUserLibraryPath from Live's preferences", () => {
  it("joins ProjectPath and ProjectName, undoing XML escapes", async () => {
    const library = folder(join(scratchDir, "R&B", "User Library"));

    writeCfg(macCfg("12.3.5"), join(scratchDir, "R&amp;B"));

    expect(await findUserLibraryPath()).toBe(library);
  });

  it("prefers the most recently written Library.cfg", async () => {
    folder(join(scratchDir, "Old", "User Library"));
    const library = folder(join(scratchDir, "New", "User Library"));

    writeCfg(macCfg("12.4"), join(scratchDir, "Old"), 1000);
    writeCfg(macCfg("12.3"), join(scratchDir, "New"), 2000);

    expect(await findUserLibraryPath()).toBe(library);
  });

  it("skips a Library.cfg without a User Library entry", async () => {
    const library = folder(join(scratchDir, "Lib", "User Library"));

    writeCfg(macCfg("12.3"), join(scratchDir, "Lib"), 1000);
    folder(dirname(macCfg("12.4")));
    writeFileSync(macCfg("12.4"), "<Ableton />");

    expect(await findUserLibraryPath()).toBe(library);
  });

  it("ignores folders that aren't a Live version", async () => {
    folder(join(scratchDir, "Lib", "User Library"));
    writeCfg(
      join(home.dir, "Library/Preferences/Ableton/Other/Library.cfg"),
      join(scratchDir, "Lib"),
    );

    expect(await findUserLibraryPath()).toBeNull();
  });

  it("reads Windows' Preferences subfolder under APPDATA", async () => {
    setPlatform("win32");
    process.env.APPDATA = folder(join(scratchDir, "AppData"));
    const library = folder(join(scratchDir, "Lib", "User Library"));

    writeCfg(
      join(scratchDir, "AppData/Ableton/Live 12.3/Preferences/Library.cfg"),
      join(scratchDir, "Lib"),
    );

    expect(await findUserLibraryPath()).toBe(library);
  });
});

describe("findUserLibraryPath from the default location", () => {
  it("finds ~/Music/Ableton/User Library on macOS", async () => {
    const library = folder(join(home.dir, "Music/Ableton/User Library"));

    expect(await findUserLibraryPath()).toBe(library);
  });

  it("finds ~/Documents/Ableton/User Library on Windows", async () => {
    setPlatform("win32");
    delete process.env.APPDATA;
    const library = folder(join(home.dir, "Documents/Ableton/User Library"));

    expect(await findUserLibraryPath()).toBe(library);
  });

  it("is null on other platforms", async () => {
    setPlatform("linux");
    folder(join(home.dir, "Music/Ableton/User Library"));

    expect(await findUserLibraryPath()).toBeNull();
  });
});
