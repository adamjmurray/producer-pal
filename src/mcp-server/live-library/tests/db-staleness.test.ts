// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectStalenessRisk } from "../db-staleness.ts";

describe("detectStalenessRisk", () => {
  let dir: string;
  let dbPath: string;
  let walPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ppal-staleness-"));
    dbPath = join(dir, "Live-files-12300.db");
    walPath = `${dbPath}-wal`;
    writeFileSync(dbPath, "main db contents");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("flags wal-pending when the WAL is newer than the .db", async () => {
    // 2 MB sidecar, 1 hour newer than the committed .db.
    writeFileSync(walPath, Buffer.alloc(2_000_000));
    setMtimes(dbPath, walPath, 1_000, 4_600);

    const risk = await detectStalenessRisk(dbPath);

    expect(risk).toStrictEqual({
      kind: "wal-pending",
      dbMtime: 1_000_000,
      walMtime: 4_600_000,
      walSizeMb: 2,
      ageSeconds: 3_600,
    });
  });

  it("rounds walSizeMb to 2 decimals", async () => {
    // 1,234,567 bytes → 1.234567 MB → 1.23 MB
    writeFileSync(walPath, Buffer.alloc(1_234_567));
    setMtimes(dbPath, walPath, 1_000, 1_010);

    const risk = await detectStalenessRisk(dbPath);

    expect(risk?.walSizeMb).toBe(1.23);
  });

  it("returns undefined when there is no -wal sidecar", async () => {
    const risk = await detectStalenessRisk(dbPath);

    expect(risk).toBeUndefined();
  });

  it("returns undefined when the WAL is older than the .db", async () => {
    writeFileSync(walPath, Buffer.alloc(2_000_000));
    setMtimes(dbPath, walPath, 5_000, 1_000);

    const risk = await detectStalenessRisk(dbPath);

    expect(risk).toBeUndefined();
  });

  it("returns undefined when the WAL mtime equals the .db mtime", async () => {
    writeFileSync(walPath, Buffer.alloc(2_000_000));
    setMtimes(dbPath, walPath, 3_000, 3_000);

    const risk = await detectStalenessRisk(dbPath);

    expect(risk).toBeUndefined();
  });

  it("swallows stat errors and returns undefined (never throws)", async () => {
    // The .db itself doesn't exist → stat(dbPath) rejects. Best-effort: no throw.
    const missing = join(dir, "Live-files-99999.db");

    await expect(detectStalenessRisk(missing)).resolves.toBeUndefined();
  });
});

/**
 * Set atime/mtime (in whole seconds) on the .db and its WAL sidecar.
 *
 * @param db - Path to the main .db file
 * @param wal - Path to the -wal sidecar
 * @param dbSeconds - mtime to apply to the .db, in epoch seconds
 * @param walSeconds - mtime to apply to the WAL, in epoch seconds
 * @returns Nothing
 */
function setMtimes(
  db: string,
  wal: string,
  dbSeconds: number,
  walSeconds: number,
): void {
  utimesSync(db, dbSeconds, dbSeconds);
  utimesSync(wal, walSeconds, walSeconds);
}
