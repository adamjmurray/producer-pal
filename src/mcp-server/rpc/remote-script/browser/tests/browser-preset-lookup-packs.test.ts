// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserNamedPackPath } from "../../../../live-library/query/pack-folder-names.ts";
import { findPresetFiles } from "../../../../live-library/query/preset-files.ts";
import { lookUpPresetFile } from "../browser-preset-files.ts";
import { lookUpBrowserPreset } from "../browser-preset-lookup.ts";

// A pack installed twice sits in "AAS Angelicals-1" but Live's browser lists it
// as "AAS Angelicals". The remote script finds files in a pack by that name,
// so the item it is sent names the pack that way; errors keep the disk path.
vi.mock(import("../../../../live-library/query/preset-files.ts"), () => ({
  findPresetFiles: vi.fn(),
}));
vi.mock(import("../../../../live-library/query/pack-folder-names.ts"), () => ({
  browserNamedPackPath: vi.fn(),
}));

const ON_DISK = "/Packs/AAS Angelicals-1/Pad/String Machine.adg";
const IN_BROWSER = "/Packs/AAS Angelicals/Pad/String Machine.adg";
const CORE = "/Live/Core Library/Pad/String Machine.adg";

beforeEach(() => {
  vi.mocked(findPresetFiles).mockReset();
  vi.mocked(browserNamedPackPath).mockReset();
  vi.mocked(browserNamedPackPath).mockImplementation((path) =>
    Promise.resolve(path === ON_DISK ? IN_BROWSER : path),
  );
});

describe("lookUpBrowserPreset — a pack folder named unlike its pack", () => {
  it("sends a file path under the pack's browser name", async () => {
    expect(
      await lookUpBrowserPreset(ON_DISK, undefined, Date.now() + 60_000),
    ).toStrictEqual({
      available: true,
      item: { type: "file", path: IN_BROWSER, name: "String Machine.adg" },
    });
  });

  it("sends the one file a name finds under the pack's browser name", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([
      { name: "String Machine.adg", path: ON_DISK },
    ]);

    expect(
      await lookUpPresetFile(
        "String Machine",
        "string machine",
        undefined,
        Date.now() + 60_000,
      ),
    ).toStrictEqual({
      available: true,
      item: { type: "file", path: IN_BROWSER, name: "String Machine.adg" },
    });
  });

  it("lists the file's path on disk when a name is ambiguous", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([
      { name: "String Machine.adg", path: CORE },
      { name: "String Machine.adg", path: ON_DISK },
    ]);

    const answer = await lookUpPresetFile(
      "String Machine",
      "string machine",
      undefined,
      Date.now() + 60_000,
    );

    expect(answer).toStrictEqual({
      available: true,
      error: expect.stringContaining(ON_DISK),
    });
    expect(browserNamedPackPath).not.toHaveBeenCalled();
  });

  it("does not look up a path that isn't a preset file", async () => {
    expect(
      await lookUpBrowserPreset(
        "/Packs/AAS Angelicals-1/Pad/x.wav",
        undefined,
        Date.now() + 60_000,
      ),
    ).toStrictEqual({
      available: true,
      error: expect.stringContaining("not a preset file"),
    });
    expect(browserNamedPackPath).not.toHaveBeenCalled();
  });
});
