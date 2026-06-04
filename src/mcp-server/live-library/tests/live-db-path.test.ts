// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findLiveFilesDbPath,
  findLivePluginsDbPath,
  liveDatabaseDir,
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
});

describe("findLivePluginsDbPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform("darwin");
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
});
