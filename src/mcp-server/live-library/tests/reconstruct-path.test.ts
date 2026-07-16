// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAbsolutePaths } from "../reconstruct-path.ts";

let scratchDir: string;
let db: DatabaseSync;

/**
 * Open a fresh writable DB at scratchDir/db.sqlite with just the `files`
 * columns reconstruct-path queries. Tests insert their own folder chain.
 *
 * @returns Open writable DB
 */
function openScratchDb(): DatabaseSync {
  const dbPath = join(scratchDir, "db.sqlite");
  const writable = new DatabaseSync(dbPath);

  writable.exec(`
    CREATE TABLE files (
      file_id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      name TEXT
    )
  `);

  return writable;
}

/**
 * Insert a row representing a single file or folder.
 *
 * @param fileId - Primary key
 * @param parentId - Parent file_id (0 or null means no parent — the
 *   schema allows NULL even though real Live DBs observed so far use 0)
 * @param name - Segment name
 */
function insertRow(
  fileId: number,
  parentId: number | null,
  name: string,
): void {
  db.prepare("INSERT INTO files VALUES (?, ?, ?)").run(fileId, parentId, name);
}

describe("resolveAbsolutePaths", () => {
  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "ppal-reconstruct-path-"));
    db = openScratchDb();
  });

  afterEach(() => {
    db.close();
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it("returns an empty map for an empty fileIds list", () => {
    expect(resolveAbsolutePaths(db, [])).toStrictEqual(new Map());
  });

  it("reconstructs a POSIX path from a '/' root chain", () => {
    insertRow(1, 0, "/");
    insertRow(2, 1, "Users");
    insertRow(3, 2, "me");
    insertRow(4, 3, "kick.wav");

    const map = resolveAbsolutePaths(db, [4]);

    expect(map.get(4)).toStrictEqual({
      path: "/Users/me/kick.wav",
      truncated: false,
      folder: "me",
    });
  });

  it("reconstructs a Windows path from a 'C:' drive-letter root", () => {
    // Live on Windows is expected to store the drive identifier as the
    // root row. We accept both "C:" and "C:\\" since the exact encoding
    // hasn't been verified end-to-end.
    insertRow(1, 0, "C:");
    insertRow(2, 1, "Users");
    insertRow(3, 2, "me");
    insertRow(4, 3, "kick.wav");

    expect(resolveAbsolutePaths(db, [4]).get(4)).toStrictEqual({
      path: "C:/Users/me/kick.wav",
      truncated: false,
      folder: "me",
    });
  });

  it("accepts a 'C:\\' drive root and strips the trailing separator", () => {
    insertRow(1, 0, "C:\\");
    insertRow(2, 1, "Users");
    insertRow(3, 2, "kick.wav");

    expect(resolveAbsolutePaths(db, [3]).get(3)?.path).toBe(
      "C:/Users/kick.wav",
    );
  });

  it("uppercases the drive letter for consistency", () => {
    insertRow(1, 0, "d:");
    insertRow(2, 1, "samples");
    insertRow(3, 2, "snare.wav");

    expect(resolveAbsolutePaths(db, [3]).get(3)?.path).toBe(
      "D:/samples/snare.wav",
    );
  });

  it("signals truncation when the chain exceeds MAX_PARENT_DEPTH", () => {
    // MAX_PARENT_DEPTH=30 in reconstruct-path.ts. A chain of 33 nodes
    // beneath root means the recursion stops before reaching the actual
    // root row — deepest visited row's parent_id is still non-zero.
    insertRow(1, 0, "/");

    for (let i = 2; i <= 34; i++) {
      insertRow(i, i - 1, `level${i}`);
    }

    insertRow(100, 34, "deep.wav");

    const resolved = resolveAbsolutePaths(db, [100]).get(100);

    expect(resolved?.truncated).toBe(true);
    // The reconstructed path is missing the leading "/" + first few
    // levels, but the segments it does have are contiguous and
    // leaf-anchored — verify the deep.wav tail is intact.
    expect(resolved?.path.endsWith("/deep.wav")).toBe(true);
    // Truncation only drops root-ward segments, so the immediate parent
    // (deep.wav's parent, file 34) is still recovered.
    expect(resolved?.folder).toBe("level34");
  });

  it("captures the immediate parent folder name", () => {
    insertRow(1, 0, "/");
    insertRow(2, 1, "Samples");
    insertRow(3, 2, "Drums");
    insertRow(4, 3, "kick.wav");

    expect(resolveAbsolutePaths(db, [4]).get(4)?.folder).toBe("Drums");
  });

  it("captures the folder for the minimal 3-segment path (root/folder/file)", () => {
    // The folder is assigned when there are >= 3 segments (root, folder, leaf) —
    // exactly 3 is the boundary. With only root + leaf (2 segments) the parent
    // is the root itself, so folder stays unset (see the next test).
    insertRow(1, 0, "/");
    insertRow(2, 1, "Samples");
    insertRow(3, 2, "kick.wav");

    expect(resolveAbsolutePaths(db, [3]).get(3)).toStrictEqual({
      path: "/Samples/kick.wav",
      truncated: false,
      folder: "Samples",
    });
  });

  it("omits folder for a file directly at the root", () => {
    insertRow(1, 0, "/");
    insertRow(2, 1, "loop.wav");

    const resolved = resolveAbsolutePaths(db, [2]).get(2);

    expect(resolved?.path).toBe("/loop.wav");
    expect(resolved).not.toHaveProperty("folder");
  });

  it("treats parent_id=NULL on the chain head as reaching the root", () => {
    // The schema declares `parent_id INTEGER` (nullable). Real Live DBs
    // observed so far use 0 for root rows, but a NULL parent must NOT
    // be misread as truncation.
    insertRow(1, null, "/");
    insertRow(2, 1, "loop.wav");

    expect(resolveAbsolutePaths(db, [2]).get(2)).toStrictEqual({
      path: "/loop.wav",
      truncated: false,
    });
  });

  it("resolves multiple files in a single query", () => {
    insertRow(1, 0, "/");
    insertRow(2, 1, "a");
    insertRow(3, 1, "b");
    insertRow(10, 2, "one.wav");
    insertRow(11, 3, "two.wav");

    const map = resolveAbsolutePaths(db, [10, 11]);

    expect(map.get(10)?.path).toBe("/a/one.wav");
    expect(map.get(11)?.path).toBe("/b/two.wav");
  });
});
