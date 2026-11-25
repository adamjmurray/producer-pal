// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { type BrowserPlugin } from "../../../../rpc/remote-script/browser/browser-plugins.ts";
import { listPlugins } from "../../../list-plugins.ts";
import { createFilesDbWithoutPluginsFixture } from "../../fixtures/plugins-fixture.ts";

vi.mock(import("../../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

vi.mock(
  import("../../../../rpc/remote-script/browser/browser-plugins.ts"),
  () => ({
    listBrowserPlugins: vi.fn(),
  }),
);

const dbPathMod = await import("../../../live-db-path.ts");
const browserMod =
  await import("../../../../rpc/remote-script/browser/browser-plugins.ts");

const LISTED: BrowserPlugin[] = [
  { name: "Brand New", vendor: "New Co", format: "VST3" },
  { name: "Old Verb", vendor: "Old Co", format: "AU" },
];

const BROWSER_ONLY = [
  {
    name: "Brand New",
    vendor: "New Co",
    version: null,
    format: "VST3",
    category: null,
    subcategories: [],
  },
  {
    name: "Old Verb",
    vendor: "Old Co",
    version: null,
    format: "AU",
    category: null,
    subcategories: [],
  },
];

describe("listPlugins — Live's plug-in database can't be read", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("still lists the browser's plug-ins when no database is found", async () => {
    vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(null);
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);
    vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue(LISTED);

    await expect(listPlugins()).resolves.toStrictEqual({
      dbAvailable: false,
      plugins: BROWSER_ONLY,
      detail: "Live plugin database not found",
    });
  });

  it("still lists the browser's plug-ins when the database fails to read", async () => {
    const fixture = createFilesDbWithoutPluginsFixture();

    try {
      vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(
        fixture.dbPath,
      );
      vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);
      vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue(LISTED);

      const result = await listPlugins();

      expect(result.dbAvailable).toBe(false);
      expect(result.plugins).toStrictEqual(BROWSER_ONLY);
      expect(result.detail).toContain("Failed to read Live plugin database");
    } finally {
      fixture.cleanup();
    }
  });

  it("applies the filters and the limit to the browser's plug-ins", async () => {
    vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(null);
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);
    vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue(LISTED);

    const byFormat = await listPlugins({ format: "AU" });
    const limited = await listPlugins({ limit: 1 });

    expect(byFormat.plugins.map((p) => p.name)).toStrictEqual(["Old Verb"]);
    expect(limited.plugins).toHaveLength(1);
    expect(limited.more).toBe(1);
  });

  it("lists nothing when the browser can't answer either", async () => {
    vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(null);
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);
    vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue(null);

    await expect(listPlugins()).resolves.toStrictEqual({
      dbAvailable: false,
      plugins: [],
      detail: "Live plugin database not found",
    });
  });
});
