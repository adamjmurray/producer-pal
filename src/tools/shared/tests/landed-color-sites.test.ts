// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  filesContaining,
  projectRoot,
} from "#src/test/helpers/meta-test-helpers.ts";

// Live keeps a fixed palette and snaps any other color to the nearest swatch,
// so a tool that writes a color the caller asked for has to read it back and
// say which swatch it landed on (landedColor). Duplicate said nothing for the
// copies that didn't go through update-clip, and update-device said nothing for
// a chain. This holds every tool to the read-back, one per write: a file with
// a second color write and no second read-back fails, however many it has.
// Only writes that spell the color out are seen; one built into a variable is
// not, so a tool doing that has to be reviewed by hand.

/** A color write: setColor, a color in setAll, or set("color"). */
const COLOR_WRITE =
  /\.setColor\(|\.setAll\(\s*\{[^}]*\bcolor\b[^}]*\}|\.set\(\s*["']color["']/g;
/** A read-back of what a write landed on. */
const READ_BACK = /\blanded[Cc]olor\(|\bwithLandedColor\(/g;

/** Where a color is written without being the caller's to read back. */
const EXEMPT: Record<string, string> = {
  "src/tools/advanced/live-api.ts":
    "the raw Live API tool sets what it is told and reports nothing",
  "src/tools/actions/duplicate/helpers/device/duplicate-chain.ts":
    "gives the copy the source chain's own color, which nobody asked for",
  "src/tools/shared/clip/recreate-clip.ts":
    "its callers read the color back, and say what they find",
};

/**
 * How many times a pattern matches a file.
 * @param file - Path from the project root
 * @param pattern - A global pattern
 * @returns The match count
 */
function countIn(file: string, pattern: RegExp): number {
  const source = fs.readFileSync(path.join(projectRoot, file), "utf8");

  return source.match(pattern)?.length ?? 0;
}

describe("a color written for the caller is read back", () => {
  it("is read back once per write in every tool", () => {
    const short = filesContaining(
      "src/tools",
      /\.setColor\(|\bsetAll\(|\.set\(/,
    )
      .filter((file) => EXEMPT[file] == null)
      .map((file) => ({
        file,
        writes: countIn(file, COLOR_WRITE),
        reads: countIn(file, READ_BACK),
      }))
      .filter(({ writes, reads }) => writes > reads)
      .map(({ file, writes, reads }) => `${file}: ${writes} writes, ${reads}`);

    expect(short, "read each color back with landedColor").toStrictEqual([]);
  });

  it("still finds the sites it guards", () => {
    const guarded = filesContaining("src/tools", /\.setColor\(|\bsetAll\(/)
      .filter((file) => EXEMPT[file] == null)
      .filter((file) => countIn(file, COLOR_WRITE) > 0);

    expect(guarded.length).toBeGreaterThan(5);
  });
});
