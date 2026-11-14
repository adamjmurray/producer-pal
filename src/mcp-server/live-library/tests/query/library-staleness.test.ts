// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * End-to-end coverage that librarySearch and listTags surface the stale-WAL
 * note through their real findLiveFilesDbPath -> stalenessNote path.
 *
 * Deliberately does NOT mock node:fs/promises so stalenessNote stats the
 * real fixture .db and a real `-wal` sidecar we write next to it.
 */

import { utimesSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STALENESS_NOTE } from "../../db-staleness.ts";
import { librarySearch } from "../../query/library-search.ts";
import { listCategories } from "../../list-categories.ts";
import { listPlugins } from "../../list-plugins.ts";
import { listTags } from "../../list-tags.ts";
import {
  createLibraryFixture,
  type LibraryFixture,
} from "../fixtures/library-fixture.ts";
import {
  createPluginsDbFixture,
  type PluginsFixture,
} from "../fixtures/plugins-fixture.ts";

vi.mock(import("../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

vi.mock(
  import("../../../rpc/remote-script/browser/browser-plugins.ts"),
  () => ({
    listBrowserPlugins: vi.fn(),
  }),
);

const dbPathMod = await import("../../live-db-path.ts");
const browserMod =
  await import("../../../rpc/remote-script/browser/browser-plugins.ts");

describe("library staleness note (end-to-end)", () => {
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

  it("librarySearch carries the staleness note", async () => {
    setup({ sizeBytes: 18_000_000, dbSeconds: 1_000, walSeconds: 15_400 });

    const result = await librarySearch({ kind: "audio" });

    expect(result.stalenessNote).toBe(STALENESS_NOTE);
    // Still returns the data alongside the advisory.
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("librarySearch carries the staleness note on the inFolder-not-found path", async () => {
    setup({ sizeBytes: 1_000_000, dbSeconds: 1_000, walSeconds: 2_000 });

    const result = await librarySearch({ inFolder: "/no/such/folder" });

    expect(result.items).toHaveLength(0);
    expect(result.stalenessNote).toBe(STALENESS_NOTE);
  });

  it("librarySearch omits the flag when there is no -wal sidecar", async () => {
    setup(null);

    const result = await librarySearch({ kind: "audio" });

    expect(result.stalenessNote).toBeUndefined();
  });

  it("librarySearch omits the flag when the -wal is older than the .db", async () => {
    setup({ sizeBytes: 1_000_000, dbSeconds: 5_000, walSeconds: 1_000 });

    const result = await librarySearch({ kind: "audio" });

    expect(result.stalenessNote).toBeUndefined();
  });

  it("listTags carries the staleness note", async () => {
    setup({ sizeBytes: 9_500_000, dbSeconds: 2_000, walSeconds: 2_300 });

    const result = await listTags();

    expect(result.stalenessNote).toBe(STALENESS_NOTE);
    expect(result.tags.length).toBeGreaterThan(0);
  });

  it("listTags omits the flag when there is no -wal sidecar", async () => {
    setup(null);

    const result = await listTags();

    expect(result.stalenessNote).toBeUndefined();
  });

  it("listCategories carries the staleness note alongside the overview payload", async () => {
    setup({ sizeBytes: 5_000_000, dbSeconds: 1_000, walSeconds: 1_120 });

    const result = await listCategories();

    expect(result.stalenessNote).toBe(STALENESS_NOTE);
    expect(result.categories?.length).toBeGreaterThan(0);
  });

  describe("listPlugins parity", () => {
    let pluginsFixture: PluginsFixture | undefined;

    afterEach(() => {
      vi.mocked(browserMod.listBrowserPlugins).mockReset();
      pluginsFixture?.cleanup();
      pluginsFixture = undefined;
    });

    /**
     * Point findLivePluginsDbPath at a plugins DB and write a `-wal` sidecar
     * next to it so stalenessNote has a real file to stat.
     *
     * @param wal - WAL setup, or null to leave no sidecar
     * @param wal.sizeBytes - WAL file size in bytes
     * @param wal.dbSeconds - .db mtime in epoch seconds
     * @param wal.walSeconds - WAL mtime in epoch seconds
     */
    function setupPlugins(
      wal: { sizeBytes: number; dbSeconds: number; walSeconds: number } | null,
    ): void {
      pluginsFixture = createPluginsDbFixture("v2");
      vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(
        pluginsFixture.dbPath,
      );
      vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

      if (wal) {
        const walPath = `${pluginsFixture.dbPath}-wal`;

        writeFileSync(walPath, Buffer.alloc(wal.sizeBytes));
        utimesSync(pluginsFixture.dbPath, wal.dbSeconds, wal.dbSeconds);
        utimesSync(walPath, wal.walSeconds, wal.walSeconds);
      }
    }

    it("carries the staleness note when the browser can't answer", async () => {
      vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue(null);
      setupPlugins({
        sizeBytes: 4_200_000,
        dbSeconds: 1_000,
        walSeconds: 1_600,
      });

      const result = await listPlugins();

      expect(result.stalenessNote).toBe(STALENESS_NOTE);
      expect(result.plugins.length).toBeGreaterThan(0);
    });

    it("omits the note when the browser answered, since it covers new installs", async () => {
      vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue([]);
      setupPlugins({
        sizeBytes: 4_200_000,
        dbSeconds: 1_000,
        walSeconds: 1_600,
      });

      const result = await listPlugins();

      expect(result.stalenessNote).toBeUndefined();
    });

    it("omits the flag when there is no -wal sidecar", async () => {
      setupPlugins(null);

      const result = await listPlugins();

      expect(result.stalenessNote).toBeUndefined();
    });
  });
});
