// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { listPlugins } from "../list-plugins.ts";
import {
  createFilesDbWithoutPluginsFixture,
  createFilesDbWithPluginsFixture,
  createPluginsDbFixture,
  type PluginsFixture,
} from "./plugins-fixture.ts";

vi.mock(import("../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../live-db-path.ts");

/**
 * Point findLivePluginsDbPath at a path and findLiveFilesDbPath at null.
 *
 * @param path - Path the separate plugins DB finder should return
 */
function usePluginsDb(path: string): void {
  vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(path);
  vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);
}

/**
 * Point findLivePluginsDbPath at null and findLiveFilesDbPath at a path
 * (the Live 11 / 12.0–12.1 fallback scenario).
 *
 * @param path - Path the files DB finder should return
 */
function useFilesDb(path: string | null): void {
  vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(null);
  vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(path);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("listPlugins — DB selection", () => {
  let pluginsV2: PluginsFixture;

  beforeAll(() => {
    pluginsV2 = createPluginsDbFixture("v2");
  });

  afterAll(() => {
    pluginsV2.cleanup();
  });

  it("returns dbAvailable: false with a reason when no plugin source exists", async () => {
    vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(null);
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

    const result = await listPlugins();

    expect(result.dbAvailable).toBe(false);
    expect(result.plugins).toHaveLength(0);
    expect(result.reason).toContain("Live plugin database not found");
  });

  it("reads from a separate Live-plugins DB when present", async () => {
    usePluginsDb(pluginsV2.dbPath);

    const result = await listPlugins();

    expect(result.dbAvailable).toBe(true);
    expect(result.plugins.map((p) => p.name)).toContain("Massive");
    // Should NOT have consulted the files DB.
    expect(dbPathMod.findLiveFilesDbPath).not.toHaveBeenCalled();
  });

  it("falls back to the files DB when it carries the plugins table", async () => {
    const fixture = createFilesDbWithPluginsFixture();

    try {
      useFilesDb(fixture.dbPath);

      const result = await listPlugins();

      expect(result.dbAvailable).toBe(true);
      expect(result.plugins.map((p) => p.name)).toContain("Massive");
    } finally {
      fixture.cleanup();
    }
  });

  it("returns dbAvailable: false when the files DB lacks a plugins table", async () => {
    const fixture = createFilesDbWithoutPluginsFixture();

    try {
      useFilesDb(fixture.dbPath);

      const result = await listPlugins();

      expect(result.dbAvailable).toBe(false);
      expect(result.plugins).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });
});

describe("listPlugins — schema variants", () => {
  it("works against a v1-shaped DB (no ARA columns)", async () => {
    const fixture = createPluginsDbFixture("v1");

    try {
      usePluginsDb(fixture.dbPath);

      const result = await listPlugins();

      expect(result.plugins.map((p) => p.name)).toContain("Serum");
    } finally {
      fixture.cleanup();
    }
  });

  it("works against a v2-shaped DB (with ARA columns)", async () => {
    const fixture = createPluginsDbFixture("v2");

    try {
      usePluginsDb(fixture.dbPath);

      const result = await listPlugins();

      expect(result.plugins.map((p) => p.name)).toContain("Serum");
    } finally {
      fixture.cleanup();
    }
  });
});

describe("listPlugins — filtering and derivation", () => {
  let fixture: PluginsFixture;

  beforeAll(() => {
    fixture = createPluginsDbFixture("v2");
  });

  afterAll(() => {
    fixture.cleanup();
  });

  it("excludes disabled (enabled=0) rows", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins();

    expect(result.plugins.map((p) => p.name)).not.toContain("Old Reverb");
  });

  it("derives format and category from dev_identifier", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins();
    const byName = new Map(result.plugins.map((p) => [p.name, p]));

    expect(byName.get("Massive")?.format).toBe("VST3");
    expect(byName.get("Massive")?.category).toBe("instrument");
    expect(byName.get("FabFilter Pro-Q 3")?.format).toBe("VST3");
    expect(byName.get("FabFilter Pro-Q 3")?.category).toBe("audiofx");
    expect(byName.get("Serum")?.format).toBe("VST");
    expect(byName.get("Serum")?.category).toBe("instrument");
    expect(byName.get("ValhallaRoom")?.format).toBe("AU");
    expect(byName.get("ValhallaRoom")?.category).toBe("audiofx");
  });

  it("returns null format/category for an unparseable dev_identifier", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins();
    const mystery = result.plugins.find((p) => p.name === "Mystery Box");

    expect(mystery?.format).toBeNull();
    expect(mystery?.category).toBeNull();
    expect(mystery?.dev_identifier).toBe("garbage-no-scheme");
  });

  it("carries through vendor and version, with nulls preserved", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins();
    const byName = new Map(result.plugins.map((p) => [p.name, p]));

    expect(byName.get("Serum")?.vendor).toBe("Xfer Records");
    expect(byName.get("Serum")?.version).toBe("1.3.6");
    expect(byName.get("Mystery Box")?.version).toBeNull();
  });

  it("filters by name substring (case-insensitive)", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins({ query: "valhalla" });

    expect(result.plugins.map((p) => p.name)).toStrictEqual(["ValhallaRoom"]);
  });

  it("filters by vendor substring (case-insensitive)", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins({ vendor: "fabfilter" });

    expect(result.plugins.map((p) => p.name)).toStrictEqual([
      "FabFilter Pro-Q 3",
    ]);
  });

  it("filters by format", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins({ format: "AU" });

    expect(result.plugins.map((p) => p.name)).toStrictEqual(["ValhallaRoom"]);
  });

  it("filters by category", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins({ category: "instrument" });

    expect(result.plugins.map((p) => p.name).sort()).toStrictEqual([
      "Massive",
      "Serum",
    ]);
  });

  it("returns plugins sorted by name (case-insensitive)", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins();
    const names = result.plugins.map((p) => p.name);
    const sorted = [...names].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );

    expect(names).toStrictEqual(sorted);
  });

  it("respects the limit", async () => {
    usePluginsDb(fixture.dbPath);

    const result = await listPlugins({ limit: 2 });

    expect(result.plugins).toHaveLength(2);
  });
});
