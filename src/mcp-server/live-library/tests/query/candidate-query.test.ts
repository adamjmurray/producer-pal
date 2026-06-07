// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveFileIdForPath } from "../../query/candidate-query.ts";

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
});
