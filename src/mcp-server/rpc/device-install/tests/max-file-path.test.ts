// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { maxPathToPosix } from "../max-file-path.ts";

const everything = (): boolean => true;
const nothing = (): boolean => false;

describe("maxPathToPosix", () => {
  it("drops the boot volume name when the rest exists", () => {
    const seen: string[] = [];
    const path = maxPathToPosix(
      "Macintosh HD:/Users/me/Music/Producer_Pal.amxd",
      (candidate) => {
        seen.push(candidate);

        return true;
      },
    );

    expect(path).toBe("/Users/me/Music/Producer_Pal.amxd");
    expect(seen).toStrictEqual(["/Users/me/Music/Producer_Pal.amxd"]);
  });

  it("puts another volume under /Volumes", () => {
    expect(
      maxPathToPosix("Samples SSD:/Devices/Producer_Pal.amxd", nothing),
    ).toBe("/Volumes/Samples SSD/Devices/Producer_Pal.amxd");
  });

  it("keeps spaces and other characters in the path", () => {
    expect(
      maxPathToPosix(
        "Macintosh HD:/Users/me/My Music/Pal (2).amxd",
        everything,
      ),
    ).toBe("/Users/me/My Music/Pal (2).amxd");
  });

  it("returns a POSIX path as it is", () => {
    expect(maxPathToPosix("/Users/me/Producer_Pal.amxd", nothing)).toBe(
      "/Users/me/Producer_Pal.amxd",
    );
  });

  it.each(["C:/Users/me/Producer_Pal.amxd", "D:\\Devices\\Producer_Pal.amxd"])(
    "keeps the Windows drive path %s",
    (path) => {
      expect(maxPathToPosix(path, nothing)).toBe(path);
    },
  );

  it("trims surrounding whitespace", () => {
    expect(maxPathToPosix("  /a/b.amxd \n", nothing)).toBe("/a/b.amxd");
  });

  it.each([
    "",
    "   ",
    "Producer_Pal.amxd",
    "Macintosh HD:",
    "relative/dir.amxd",
  ])("refuses %j, which isn't an absolute file path", (path) => {
    expect(maxPathToPosix(path, everything)).toBeNull();
  });
});
