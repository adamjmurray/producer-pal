// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { resolveFileIds } from "../../query/resolve-file-ids.ts";
import {
  createBrokenLibraryDb,
  setupLibraryFixtureLifecycle,
} from "../fixtures/library-fixture.ts";

vi.mock(import("../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../../live-db-path.ts");
const PACK = "/Users/test/Music/Ableton/Factory Packs/Pack One";

describe("resolveFileIds", () => {
  setupLibraryFixtureLifecycle(dbPathMod);

  it("finds the file_id of each path the DB lists", async () => {
    const { fileIds } = await resolveFileIds({
      paths: [`${PACK}/pack_kick.wav`, `${PACK}/SubA/subfolder_x.wav`],
    });

    expect(fileIds.toSorted((a, b) => a - b)).toStrictEqual([211, 2001]);
  });

  it("matches case-insensitively", async () => {
    const { fileIds } = await resolveFileIds({
      paths: ["/users/TEST/music/ableton/factory packs/pack one/PACK_KICK.WAV"],
    });

    expect(fileIds).toStrictEqual([2001]);
  });

  it("skips a path the DB doesn't list, in a listed folder or not", async () => {
    const { fileIds } = await resolveFileIds({
      paths: [
        `${PACK}/missing.wav`,
        "/nowhere/pack_kick.wav",
        "no-slash.wav",
        `${PACK}/pack_clap.aif`,
      ],
    });

    expect(fileIds).toStrictEqual([2002]);
  });

  it("answers nothing when none of the folders are in the DB", async () => {
    const { fileIds } = await resolveFileIds({ paths: ["/nowhere/a.wav"] });

    expect(fileIds).toStrictEqual([]);
  });

  it("finds a file directly under the root", async () => {
    const { fileIds } = await resolveFileIds({ paths: ["/Users"] });

    expect(fileIds).toStrictEqual([2]);
  });

  it("answers nothing for no paths", async () => {
    await expect(resolveFileIds()).resolves.toStrictEqual({ fileIds: [] });
    await expect(resolveFileIds({ paths: [] })).resolves.toStrictEqual({
      fileIds: [],
    });
  });

  it("handles thousands of paths", async () => {
    const paths = Array.from(
      { length: 4000 },
      (_, i) => `${PACK}/Folder ${i % 400}/file ${i}.wav`,
    );
    const { fileIds } = await resolveFileIds({
      paths: [...paths, `${PACK}/pack_kick.wav`],
    });

    expect(fileIds).toStrictEqual([2001]);
  });

  it("answers nothing when the DB is missing", async () => {
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);

    await expect(
      resolveFileIds({ paths: [`${PACK}/pack_kick.wav`] }),
    ).resolves.toStrictEqual({ fileIds: [] });
  });

  it("answers nothing when the DB can't be read", async () => {
    const broken = createBrokenLibraryDb();

    try {
      vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(broken.dbPath);

      await expect(
        resolveFileIds({ paths: [`${PACK}/pack_kick.wav`] }),
      ).resolves.toStrictEqual({ fileIds: [] });
    } finally {
      broken.cleanup();
    }
  });
});
