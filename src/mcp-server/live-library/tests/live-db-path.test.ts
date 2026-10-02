// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findLiveFilesDbPath,
  findLivePluginsDbPath,
  liveDatabaseDir,
  setRunningLiveMajor,
} from "../live-db-path.ts";

vi.mock(import("node:fs/promises"), () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));
vi.mock(import("node:os"), () => ({
  homedir: vi.fn(() => "/Users/test"),
}));

const fsMock = await import("node:fs/promises");

const originalPlatform = process.platform;
const originalLocalAppData = process.env.LOCALAPPDATA;

/**
 * Override process.platform for a test.
 *
 * @param platform - Platform string to set
 */
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform });
}

type ReaddirResult = Awaited<ReturnType<typeof fsMock.readdir>>;
type StatResult = Awaited<ReturnType<typeof fsMock.stat>>;

function mockReaddir(...names: string[]): void {
  vi.mocked(fsMock.readdir).mockResolvedValue(
    names as unknown as ReaddirResult,
  );
}

function mockStatMtime(mtimeMs: number): void {
  vi.mocked(fsMock.stat).mockResolvedValue({
    mtimeMs,
  } as unknown as StatResult);
}

function mockStatMtimeOnce(mtimeMs: number): void {
  vi.mocked(fsMock.stat).mockResolvedValueOnce({
    mtimeMs,
  } as unknown as StatResult);
}

/**
 * A database file for a second, hypothetical future Live major. No such
 * release exists — the filename shape is inferred from how the Live 11 -> 12
 * upgrade versioned these files, and it stands in for "another major is
 * installed alongside the running one".
 */
const SYNTHETIC_FUTURE_MAJOR_DB = "Live-files-13003.db";

/**
 * Stat every entry from a name -> mtime map, failing for anything absent.
 * Order-independent, unlike the `Once` queues, so a test can mock both DB
 * kinds without depending on which one is read first.
 *
 * @param mtimes - Map of file name to mtime in ms
 */
function mockStatByName(mtimes: Record<string, number>): void {
  vi.mocked(fsMock.stat).mockImplementation((path) => {
    const name = String(path).split("/").pop() ?? "";
    const mtimeMs = mtimes[name];

    return mtimeMs == null
      ? Promise.reject(new Error("ENOENT"))
      : Promise.resolve({ mtimeMs } as unknown as StatResult);
  });
}

describe("liveDatabaseDir", () => {
  afterEach(() => {
    setPlatform(originalPlatform);

    if (originalLocalAppData == null) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = originalLocalAppData;
    }
  });

  it("returns the macOS path", () => {
    setPlatform("darwin");

    expect(liveDatabaseDir()).toBe(
      "/Users/test/Library/Application Support/Ableton/Live Database",
    );
  });

  it("returns the Windows path from LOCALAPPDATA", () => {
    setPlatform("win32");
    process.env.LOCALAPPDATA = "C:\\Users\\test\\AppData\\Local";

    expect(liveDatabaseDir()).toContain("Ableton");
    expect(liveDatabaseDir()).toContain("Live Database");
  });

  it("returns null on Windows when LOCALAPPDATA is unset", () => {
    setPlatform("win32");
    delete process.env.LOCALAPPDATA;

    expect(liveDatabaseDir()).toBeNull();
  });

  it("returns null on unsupported platforms", () => {
    setPlatform("linux");

    expect(liveDatabaseDir()).toBeNull();
  });
});

describe("findLiveFilesDbPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform("darwin");
    setRunningLiveMajor(null);
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it("returns null on unsupported platforms", async () => {
    setPlatform("linux");

    expect(await findLiveFilesDbPath()).toBeNull();
  });

  it("returns null when the directory cannot be read", async () => {
    vi.mocked(fsMock.readdir).mockRejectedValue(new Error("ENOENT"));

    expect(await findLiveFilesDbPath()).toBeNull();
  });

  it("returns null when no matching files are found", async () => {
    mockReaddir("Live-plugins-1.db", "other.txt");

    expect(await findLiveFilesDbPath()).toBeNull();
  });

  it("picks the highest schema version", async () => {
    mockReaddir(
      "Live-files-53.db",
      "Live-files-1218.db",
      "Live-files-12300.db",
      "Live-files-1200.db",
    );
    mockStatMtime(1_000);

    const result = await findLiveFilesDbPath();

    expect(result).toContain("Live-files-12300.db");
  });

  it("breaks ties by most recent mtime", async () => {
    mockReaddir("Live-files-12300.db", "Live-files-12300.db");
    mockStatMtimeOnce(1_000);
    mockStatMtimeOnce(2_000);

    const result = await findLiveFilesDbPath();

    expect(result).toContain("Live-files-12300.db");
  });

  it("ignores entries that do not match the pattern", async () => {
    mockReaddir("Live-files-bogus.db", "Live-files-12300.db", "random.db");
    mockStatMtime(1_000);

    const result = await findLiveFilesDbPath();

    expect(result).toContain("Live-files-12300.db");
  });

  it("skips entries whose stat fails", async () => {
    mockReaddir("Live-files-12300.db", "Live-files-1218.db");
    vi.mocked(fsMock.stat).mockRejectedValueOnce(new Error("EACCES"));
    mockStatMtimeOnce(1_000);

    const result = await findLiveFilesDbPath();

    expect(result).toContain("Live-files-1218.db");
  });

  it("prefers the running major over a higher-numbered other major", async () => {
    mockReaddir("Live-files-12300.db", SYNTHETIC_FUTURE_MAJOR_DB);
    mockStatMtime(1_000);

    const result = await findLiveFilesDbPath(12);

    expect(result).toContain("Live-files-12300.db");
  });

  it("picks the highest number within the running major", async () => {
    mockReaddir(
      "Live-files-12300.db",
      "Live-files-12200.db",
      SYNTHETIC_FUTURE_MAJOR_DB,
    );
    mockStatMtime(1_000);

    const result = await findLiveFilesDbPath(12);

    expect(result).toContain("Live-files-12300.db");
  });

  it("falls back to the highest number when no DB matches the major", async () => {
    mockReaddir("Live-files-12300.db", SYNTHETIC_FUTURE_MAJOR_DB);
    mockStatMtime(1_000);

    const result = await findLiveFilesDbPath(11);

    expect(result).toContain(SYNTHETIC_FUTURE_MAJOR_DB);
  });

  it("uses the major recorded by the last route call", async () => {
    setRunningLiveMajor(12);
    mockReaddir("Live-files-12300.db", SYNTHETIC_FUTURE_MAJOR_DB);
    mockStatMtime(1_000);

    const result = await findLiveFilesDbPath();

    expect(result).toContain("Live-files-12300.db");
  });
});

describe("findLivePluginsDbPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform("darwin");
    setRunningLiveMajor(null);
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it("returns null when no matching files exist", async () => {
    mockReaddir("Live-files-12300.db");

    expect(await findLivePluginsDbPath()).toBeNull();
  });

  it("returns null when the directory cannot be read", async () => {
    vi.mocked(fsMock.readdir).mockRejectedValue(new Error("ENOENT"));

    expect(await findLivePluginsDbPath()).toBeNull();
  });

  it("picks by mtime (ignores version number)", async () => {
    mockReaddir("Live-plugins-1.db", "Live-plugins-2.db");
    mockStatMtimeOnce(9_000);
    mockStatMtimeOnce(1_000);

    const result = await findLivePluginsDbPath();

    expect(result).toContain("Live-plugins-1.db");
  });

  it("skips entries whose stat fails", async () => {
    mockReaddir("Live-plugins-1.db", "Live-plugins-2.db");
    vi.mocked(fsMock.stat).mockRejectedValueOnce(new Error("EACCES"));
    mockStatMtimeOnce(1_000);

    const result = await findLivePluginsDbPath();

    expect(result).toContain("Live-plugins-2.db");
  });

  it("pairs with the chosen files DB by nearest mtime", async () => {
    // Each install writes both DBs within about a second of exiting, so the
    // newest plugins DB belongs to the other major here, not to the running one.
    mockReaddir(
      "Live-files-12300.db",
      SYNTHETIC_FUTURE_MAJOR_DB,
      "Live-plugins-1.db",
      "Live-plugins-2.db",
    );
    mockStatByName({
      "Live-files-12300.db": 100_000,
      [SYNTHETIC_FUTURE_MAJOR_DB]: 999_999,
      "Live-plugins-1.db": 999_998,
      "Live-plugins-2.db": 100_002,
    });

    const result = await findLivePluginsDbPath(12);

    expect(result).toContain("Live-plugins-2.db");
  });

  it("pairs with the other major's files DB when that one is running", async () => {
    mockReaddir(
      "Live-files-12300.db",
      SYNTHETIC_FUTURE_MAJOR_DB,
      "Live-plugins-1.db",
      "Live-plugins-2.db",
    );
    mockStatByName({
      "Live-files-12300.db": 100_000,
      [SYNTHETIC_FUTURE_MAJOR_DB]: 999_999,
      "Live-plugins-1.db": 999_998,
      "Live-plugins-2.db": 100_002,
    });

    const result = await findLivePluginsDbPath(13);

    expect(result).toContain("Live-plugins-1.db");
  });

  it("falls back to the newest plugins DB when there is no files DB", async () => {
    mockReaddir("Live-plugins-1.db", "Live-plugins-2.db");
    mockStatByName({
      "Live-plugins-1.db": 1_000,
      "Live-plugins-2.db": 9_000,
    });

    const result = await findLivePluginsDbPath(12);

    expect(result).toContain("Live-plugins-2.db");
  });
});
