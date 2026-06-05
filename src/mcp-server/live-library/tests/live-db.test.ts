// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodePathForSqliteUri, openLiveDb } from "../live-db.ts";

let scratchDir: string;
let dbPath: string;

/**
 * Create a writable fixture DB at a given path with one populated table.
 *
 * @param path - Filesystem path for the new DB file
 */
function createFixtureDb(path: string): void {
  const writable = new DatabaseSync(path);

  writable.exec("CREATE TABLE files (file_id INTEGER PRIMARY KEY, name TEXT)");
  writable.prepare("INSERT INTO files VALUES (?, ?)").run(1, "kick.wav");
  writable.prepare("INSERT INTO files VALUES (?, ?)").run(2, "snare.wav");
  writable.close();
}

describe("openLiveDb", () => {
  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "ppal-live-db-test-"));
    dbPath = join(scratchDir, "fixture.db");
    createFixtureDb(dbPath);
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it("opens a DB and returns SELECT results", async () => {
    const db = await openLiveDb(dbPath);
    const rows = db
      .prepare("SELECT name FROM files ORDER BY file_id")
      .all()
      .map((row) => ({ ...row }));

    db.close();

    expect(rows).toStrictEqual([{ name: "kick.wav" }, { name: "snare.wav" }]);
  });

  it("rejects writes (read-only enforcement)", async () => {
    const db = await openLiveDb(dbPath);

    expect(() => db.exec("INSERT INTO files VALUES (3, 'crash.wav')")).toThrow(
      /readonly|read[ -]?only/i,
    );

    db.close();
  });

  it("encodes ? and # in path so URI parsing does not eat them", async () => {
    const trickyDir = join(scratchDir, "weird?name#here");

    mkdirSync(trickyDir, { recursive: true });

    const trickyPath = join(trickyDir, "fixture.db");

    createFixtureDb(trickyPath);

    const db = await openLiveDb(trickyPath);
    const row = db.prepare("SELECT COUNT(*) AS n FROM files").get() as {
      n: number;
    };

    db.close();

    expect(row.n).toBe(2);
  });

  it("throws when the file does not exist", async () => {
    await expect(openLiveDb(join(scratchDir, "missing.db"))).rejects.toThrow();
  });
});

describe("encodePathForSqliteUri", () => {
  it("passes Unix absolute paths through unchanged", () => {
    expect(encodePathForSqliteUri("/Users/me/file.db")).toBe(
      "/Users/me/file.db",
    );
  });

  it("converts Windows backslashes to forward slashes and roots the path", () => {
    expect(encodePathForSqliteUri("C:\\Users\\me\\file.db")).toBe(
      "/C:/Users/me/file.db",
    );
  });

  it("encodes %, ?, # within a Windows path", () => {
    expect(encodePathForSqliteUri("C:\\foo?bar#baz%qux\\file.db")).toBe(
      "/C:/foo%3Fbar%23baz%25qux/file.db",
    );
  });
});
