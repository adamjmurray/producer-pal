// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type DatabaseSync } from "node:sqlite";
import { findLiveFilesDbPath } from "../live-db-path.ts";
import { openLiveDb } from "../live-db.ts";
import { resolveAbsolutePaths } from "../reconstruct-path.ts";

/** `places.folder_kind` for the User Library row, verified on a Live 12 DB. */
const USER_LIBRARY_FOLDER_KIND = 1;

/** The User Library entry in Library.cfg: its parent folder and its name. */
const USER_LIBRARY_ENTRY = /<UserLibrary>([\s\S]*?)<\/UserLibrary>/;
const PROJECT_PATH = /<ProjectPath Value="([^"]*)"/;
const PROJECT_NAME = /<ProjectName Value="([^"]*)"/;
const USER_LIBRARY = "User Library";

/**
 * Find Live's User Library folder. Tries Live's browser database, then the
 * newest Live preferences, then the default location, and returns the first
 * that is an existing folder. The database needs `node:sqlite`, which Live
 * before 12.4 lacks, so the other two are what those versions rely on.
 *
 * Never throws: when nothing is found it's null, so callers can ask the user.
 *
 * @returns Absolute path to the User Library, or null when it can't be found
 */
export async function findUserLibraryPath(): Promise<string | null> {
  for (const find of [fromLiveDb, fromPreferences, defaultLocation]) {
    const path = await firstFolder(await find());

    if (path != null) {
      return path;
    }
  }

  return null;
}

/**
 * The User Library path the browser database holds.
 *
 * @returns The path, or none when the database can't be read
 */
async function fromLiveDb(): Promise<string[]> {
  const dbPath = await findLiveFilesDbPath();

  if (dbPath == null) {
    return [];
  }

  let db: DatabaseSync | undefined;

  try {
    db = await openLiveDb(dbPath);
    const path = userLibraryPathIn(db);

    return path == null ? [] : [path];
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

/**
 * Read the User Library's absolute path out of an open files database.
 *
 * @param db - Open Live files database
 * @returns The absolute path, or null when the row or its parent chain is gone
 */
function userLibraryPathIn(db: DatabaseSync): string | null {
  const row = db
    .prepare("SELECT file_id FROM places WHERE folder_kind = ? LIMIT 1")
    .get(USER_LIBRARY_FOLDER_KIND) as { file_id?: unknown } | undefined;

  if (typeof row?.file_id !== "number") {
    return null;
  }

  return resolveAbsolutePaths(db, [row.file_id]).get(row.file_id)?.path ?? null;
}

/**
 * The User Library paths in every installed Live's Library.cfg, most recently
 * written first, so the Live used last wins.
 *
 * @returns The paths, possibly none
 */
async function fromPreferences(): Promise<string[]> {
  const files = await libraryCfgFiles();
  const dated: { path: string; mtimeMs: number }[] = [];

  for (const file of files) {
    try {
      const [contents, stats] = await Promise.all([
        readFile(file, "utf8"),
        stat(file),
      ]);
      const path = userLibraryPathInCfg(contents);

      if (path != null) {
        dated.push({ path, mtimeMs: stats.mtimeMs });
      }
    } catch {
      continue;
    }
  }

  return dated.toSorted((a, b) => b.mtimeMs - a.mtimeMs).map((d) => d.path);
}

/**
 * Where each installed Live keeps its Library.cfg. Live makes one preferences
 * folder per version, named like "Live 12.3.5".
 *
 * @returns Paths to Library.cfg files that may exist
 */
async function libraryCfgFiles(): Promise<string[]> {
  const root = preferencesRoot();

  if (root == null) {
    return [];
  }

  let names: string[];

  try {
    names = await readdir(root);
  } catch {
    return [];
  }

  // Windows nests the file one folder deeper than macOS does.
  const sub = process.platform === "win32" ? ["Preferences"] : [];

  return names
    .filter((name) => name.startsWith("Live "))
    .map((name) => join(root, name, ...sub, "Library.cfg"));
}

/**
 * @returns The folder holding one preferences folder per Live version, or null
 *   on an unsupported platform
 */
function preferencesRoot(): string | null {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Preferences", "Ableton");
  }

  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "Ableton");
  }

  return null;
}

/**
 * Read the User Library path out of Library.cfg's XML.
 *
 * @param xml - Library.cfg contents
 * @returns The absolute path, or null when the entry is missing
 */
function userLibraryPathInCfg(xml: string): string | null {
  const entry = USER_LIBRARY_ENTRY.exec(xml)?.[1];
  const parent = entry == null ? undefined : PROJECT_PATH.exec(entry)?.[1];

  if (parent == null || parent === "") {
    return null;
  }

  const name = PROJECT_NAME.exec(entry ?? "")?.[1];

  return join(
    decodeXml(parent),
    name == null || name === "" ? USER_LIBRARY : decodeXml(name),
  );
}

/**
 * @param text - An XML attribute value
 * @returns The value with XML's escapes undone
 */
function decodeXml(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/**
 * Where Live puts the User Library unless the user moves it.
 *
 * @returns The default path, or none on an unsupported platform
 */
function defaultLocation(): string[] {
  if (process.platform === "darwin") {
    return [join(homedir(), "Music", "Ableton", USER_LIBRARY)];
  }

  if (process.platform === "win32") {
    return [join(homedir(), "Documents", "Ableton", USER_LIBRARY)];
  }

  return [];
}

/**
 * @param paths - Candidate paths, best first
 * @returns The first one that is an existing folder, or null
 */
async function firstFolder(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      const stats = await stat(path);

      if (stats.isDirectory()) {
        return path;
      }
    } catch {
      continue;
    }
  }

  return null;
}
