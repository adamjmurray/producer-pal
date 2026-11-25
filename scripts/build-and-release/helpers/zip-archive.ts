// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Zip in plain Node, so the build doesn't need a zip CLI (Windows
 * has none). Deflate only, no zip64: fine for the skill folders, not for
 * anything over 4 GB.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIR = 0x06054b50;
const DEFLATE = 8;
const STORE = 0;
/** "Made by" Unix, zip spec 3.0, so unzip there applies the modes below */
const MADE_BY_UNIX = (3 << 8) | 30;
const FILE_MODE = 0o100644;
const DIR_MODE = 0o040755;
const UTF8_NAMES = 1 << 11;

interface Entry {
  name: string;
  data: Buffer;
  mode: number;
  mtime: Date;
}

/**
 * Zip folders, each kept under its own name at the zip root.
 *
 * @param zipFile - Zip to write
 * @param baseDir - Folder the entries are named relative to
 * @param folders - Folders under `baseDir` to include
 * @param skip - File names to leave out, such as `.DS_Store`
 */
export function zipFolders(
  zipFile: string,
  baseDir: string,
  folders: string[],
  skip: string[] = [],
): void {
  const entries = folders.flatMap((folder) =>
    collectEntries(baseDir, folder, new Set(skip)),
  );
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const isDir = entry.name.endsWith("/");
    const compressed = isDir ? entry.data : deflateRawSync(entry.data);
    const name = Buffer.from(entry.name, "utf8");
    const shared = Buffer.alloc(26);

    shared.writeUInt16LE(20, 0);
    shared.writeUInt16LE(UTF8_NAMES, 2);
    shared.writeUInt16LE(isDir ? STORE : DEFLATE, 4);
    shared.writeUInt32LE(dosDateTime(entry.mtime), 6);
    shared.writeUInt32LE(crc32(entry.data), 10);
    shared.writeUInt32LE(compressed.length, 14);
    shared.writeUInt32LE(entry.data.length, 18);
    shared.writeUInt16LE(name.length, 22);

    const local = Buffer.concat([u32(LOCAL_HEADER), shared, name, compressed]);
    const central = Buffer.alloc(46);

    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(MADE_BY_UNIX, 4);
    shared.copy(central, 6, 0, 26);
    central.writeUInt32LE((entry.mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local);
    centrals.push(Buffer.concat([central, name]));
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(END_OF_CENTRAL_DIR, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(zipFile, Buffer.concat([...locals, centralDir, end]));
}

/**
 * @param baseDir - Folder entry names are relative to
 * @param relDir - Folder to walk, relative to `baseDir`
 * @param skip - File names to leave out
 * @returns The folder and everything under it, sorted
 */
function collectEntries(
  baseDir: string,
  relDir: string,
  skip: Set<string>,
): Entry[] {
  const dir = path.join(baseDir, relDir);
  const name = `${relDir.split(path.sep).join("/")}/`;
  const entries: Entry[] = [
    {
      name,
      data: Buffer.alloc(0),
      mode: DIR_MODE,
      mtime: statSync(dir).mtime,
    },
  ];

  const children = readdirSync(dir).toSorted((a, b) => a.localeCompare(b));

  for (const child of children) {
    const rel = path.join(relDir, child);

    if (skip.has(child)) {
      continue;
    }

    // statSync follows symlinks, so a linked folder is zipped like zip -r does
    const stats = statSync(path.join(baseDir, rel));

    if (stats.isDirectory()) {
      entries.push(...collectEntries(baseDir, rel, skip));
    } else {
      entries.push({
        name: rel.split(path.sep).join("/"),
        data: readFileSync(path.join(baseDir, rel)),
        mode: FILE_MODE,
        mtime: stats.mtime,
      });
    }
  }

  return entries;
}

/**
 * @param date - A local time
 * @returns The MS-DOS time (low 16 bits) and date (high 16 bits) zip stores
 */
function dosDateTime(date: Date): number {
  const year = Math.max(date.getFullYear(), 1980) - 1980;
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day = (year << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return ((day << 16) | time) >>> 0;
}

/**
 * @param value - A 32-bit unsigned integer
 * @returns It as 4 little-endian bytes
 */
function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);

  buffer.writeUInt32LE(value);

  return buffer;
}
