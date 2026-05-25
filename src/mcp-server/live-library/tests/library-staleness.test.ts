// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * End-to-end coverage that librarySearch and listTags surface the stale-WAL
 * advisory through their real findLiveFilesDbPath -> detectStalenessRisk path.
 *
 * Deliberately does NOT mock node:fs/promises so detectStalenessRisk stats the
 * real fixture .db and a real `-wal` sidecar we write next to it.
 */

import { utimesSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { librarySearch } from "../library-search.ts";
import { listTags } from "../list-tags.ts";
import {
  createLibraryFixture,
  type LibraryFixture,
} from "./fixtures/library-fixture.ts";

vi.mock(import("../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../live-db-path.ts");

describe("library stale-WAL advisory (end-to-end)", () => {
  let fixture: LibraryFixture | undefined;

  afterEach(() => {
    fixture?.cleanup();
    fixture = undefined;
    vi.clearAllMocks();
  });

  /**
   * Build a fresh fixture, point the finder at it, and optionally write a
   * `-wal` sidecar with controlled mtimes relative to the .db.
   *
   * @param wal - WAL setup, or null to leave no sidecar
   * @param wal.sizeBytes - WAL file size in bytes
   * @param wal.dbSeconds - .db mtime in epoch seconds
   * @param wal.walSeconds - WAL mtime in epoch seconds
   * @returns Nothing
   */
  function setup(
    wal: { sizeBytes: number; dbSeconds: number; walSeconds: number } | null,
  ): void {
    fixture = createLibraryFixture();
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(fixture.dbPath);

    if (wal) {
      const walPath = `${fixture.dbPath}-wal`;

      writeFileSync(walPath, Buffer.alloc(wal.sizeBytes));
      utimesSync(fixture.dbPath, wal.dbSeconds, wal.dbSeconds);
      utimesSync(walPath, wal.walSeconds, wal.walSeconds);
    }
  }

  it("librarySearch flags wal-pending with the full payload", async () => {
    setup({ sizeBytes: 18_000_000, dbSeconds: 1_000, walSeconds: 15_400 });

    const result = await librarySearch({ kind: "audio" });

    expect(result.stalenessRisk).toStrictEqual({
      kind: "wal-pending",
      dbMtime: 1_000_000,
      walMtime: 15_400_000,
      walSizeMb: 18,
      ageSeconds: 14_400,
    });
    // Still returns the data alongside the advisory.
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("librarySearch flags wal-pending on the inFolder-not-found path", async () => {
    setup({ sizeBytes: 1_000_000, dbSeconds: 1_000, walSeconds: 2_000 });

    const result = await librarySearch({ inFolder: "/no/such/folder" });

    expect(result.items).toHaveLength(0);
    expect(result.stalenessRisk?.kind).toBe("wal-pending");
  });

  it("librarySearch omits the flag when there is no -wal sidecar", async () => {
    setup(null);

    const result = await librarySearch({ kind: "audio" });

    expect(result.stalenessRisk).toBeUndefined();
  });

  it("librarySearch omits the flag when the -wal is older than the .db", async () => {
    setup({ sizeBytes: 1_000_000, dbSeconds: 5_000, walSeconds: 1_000 });

    const result = await librarySearch({ kind: "audio" });

    expect(result.stalenessRisk).toBeUndefined();
  });

  it("listTags flags wal-pending with the full payload", async () => {
    setup({ sizeBytes: 9_500_000, dbSeconds: 2_000, walSeconds: 2_300 });

    const result = await listTags();

    expect(result.stalenessRisk).toStrictEqual({
      kind: "wal-pending",
      dbMtime: 2_000_000,
      walMtime: 2_300_000,
      walSizeMb: 9.5,
      ageSeconds: 300,
    });
    expect(result.tags.length).toBeGreaterThan(0);
  });

  it("listTags omits the flag when there is no -wal sidecar", async () => {
    setup(null);

    const result = await listTags();

    expect(result.stalenessRisk).toBeUndefined();
  });
});
