// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildLibraryItem,
  resolveFileIdForPath,
  type SearchRow,
} from "../../query/candidate-query.ts";
import { type ResolvedPath } from "../../reconstruct-path.ts";

describe("resolveFileIdForPath", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(
      "CREATE TABLE files (file_id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT)",
    );
  });

  afterEach(() => {
    db.close();
  });

  function insert(fileId: number, parentId: number, name: string): void {
    db.prepare(
      "INSERT INTO files (file_id, parent_id, name) VALUES (?, ?, ?)",
    ).run(fileId, parentId, name);
  }

  it("resolves a path when the drive root is stored as 'C:\\' (#17)", () => {
    // Live may store the Windows drive root with a trailing backslash, but the
    // reconstructed path always renders it as "C:". The lookup must match either
    // stored form, or a "C:\"-rooted DB never resolves.
    insert(1, 0, "C:\\");
    insert(2, 1, "Users");
    insert(3, 2, "kick.wav");

    expect(resolveFileIdForPath(db, "C:/Users/kick.wav")).toBe(3);
  });

  it("resolves a path when the drive root is stored as 'C:'", () => {
    insert(1, 0, "C:");
    insert(2, 1, "Users");
    insert(3, 2, "snare.wav");

    expect(resolveFileIdForPath(db, "C:/Users/snare.wav")).toBe(3);
  });

  it("resolves a POSIX path under the '/' root (non-drive root unaffected)", () => {
    insert(1, 0, "/");
    insert(2, 1, "Users");
    insert(3, 2, "hat.aif");

    expect(resolveFileIdForPath(db, "/Users/hat.aif")).toBe(3);
  });

  it("returns null when a path segment does not exist", () => {
    insert(1, 0, "C:\\");

    expect(resolveFileIdForPath(db, "C:/Missing/file.wav")).toBeNull();
  });

  it("returns null when the root element is not in the DB", () => {
    // Empty files table -> the root row lookup misses entirely.
    expect(resolveFileIdForPath(db, "/Users/kick.wav")).toBeNull();
  });

  it("skips empty interior segments from collapsed slashes", () => {
    // A "//" in the middle yields an empty segment that must be skipped rather
    // than treated as a (never-matching) child name.
    insert(1, 0, "/");
    insert(2, 1, "Users");
    insert(3, 2, "clap.wav");

    expect(resolveFileIdForPath(db, "/Users//clap.wav")).toBe(3);
  });
});

describe("buildLibraryItem", () => {
  function makeRow(overrides: Partial<SearchRow> = {}): SearchRow {
    return {
      file_id: 1,
      parent_id: 0,
      name: "kick.wav",
      use_count: 0,
      file_type: 0,
      subtype: null,
      folder_kind: null,
      ...overrides,
    };
  }

  it("uses the resolved path, folder, and truncation flag when present", () => {
    const resolved: ResolvedPath = {
      path: "/Samples/Drums/kick.wav",
      folder: "Drums",
      truncated: true,
    };
    const paths = new Map([[1, resolved]]);

    const item = buildLibraryItem(makeRow(), paths, new Map());

    expect(item.path).toBe("/Samples/Drums/kick.wav");
    expect(item.folder).toBe("Drums");
    expect(item.pathTruncated).toBe(true);
  });

  it("falls back to /<name> when the path was not resolved", () => {
    // No entry in the paths map -> resolved is undefined, so the path,
    // folder, and truncation flag all take their absent branches.
    const item = buildLibraryItem(makeRow(), new Map(), new Map());

    expect(item.path).toBe("/kick.wav");
    expect(item.folder).toBeUndefined();
    expect(item.pathTruncated).toBeUndefined();
  });
});
