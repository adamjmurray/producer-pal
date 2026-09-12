// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { constants, gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MIN_LIVE_VERSION } from "#src/shared/config.ts";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";

// Live cannot open a Set saved by a newer Live. A test Set authored above
// MIN_LIVE_VERSION is therefore unrunnable on the oldest version we claim to
// support, and nothing notices until someone tries. This reads the version
// stamp out of the file, so it needs no Ableton and runs in CI.
const LIVE_SET_DIRS = ["e2e/live-sets", "evals/live-sets"];

// An .als is gzipped XML whose root element carries the stamp:
//
//   <Ableton MajorVersion="5" MinorVersion="12.0_12300" Creator="Ableton Live 12.3.2" ...>
//
// Compare MinorVersion, not Creator. Creator is the exact build that saved the
// file and is routinely newer than the minimum in a way that is still fine —
// three different 12.3.x builds all write 12300. MinorVersion is the schema,
// and that is what decides whether an older Live can open the file.
const ABLETON_TAG = /<Ableton\b[^>]*>/;
const MINOR_VERSION_ATTR = /\bMinorVersion="([^"]*)"/;

// Ableton doesn't document the encoding. Observed: 12.3.x -> "12.0_12300",
// 12.4.3 -> "12.0_12402". So the 5-digit code reads as major*1000 + minor*100 +
// something that does not track the patch number. Anything else is a stamp we
// don't understand, and a parse that quietly returns "fine" is worse than no
// test — so the pattern is strict and a miss throws.
const MINOR_VERSION_FORMAT = /^(\d+)\.\d+_(\d{5})$/;

describe("test Live Set versions", () => {
  const liveSets = LIVE_SET_DIRS.flatMap(findLiveSets);
  const minSchema = parseMinLiveVersion(MIN_LIVE_VERSION);

  it("finds the test Live Sets", () => {
    // Without this the suite passes by finding nothing.
    expect(liveSets.length).toBeGreaterThan(0);
  });

  it.each(liveSets)("%s opens in Live " + MIN_LIVE_VERSION, (relPath) => {
    const schema = readSchemaVersion(path.join(projectRoot, relPath));

    if (schema > minSchema) {
      expect.fail(
        `${relPath} was saved by a Live newer than MIN_LIVE_VERSION ` +
          `(${MIN_LIVE_VERSION}). Re-save it from Live ${MIN_LIVE_VERSION}, ` +
          `or the tests that open it cannot run on the oldest Live we support.`,
      );
    }
  });
});

describe("parseSchemaVersion", () => {
  it.each([
    ["12.0_12300", 123],
    ["12.0_12402", 124],
  ])("reads %s as %i", (stamp, expected) => {
    expect(parseSchemaVersion(stamp)).toBe(expected);
  });

  it.each([
    ["12.0_11300", "a code that disagrees with the leading major version"],
    ["12.0_121000", "a 6-digit code"],
    ["12.0_1230", "a 4-digit code"],
    ["12300", "no leading field"],
    ["", "an empty stamp"],
  ])("throws on %s (%s)", (stamp) => {
    expect(() => parseSchemaVersion(stamp)).toThrow(/MinorVersion/);
  });
});

/**
 * Finds every .als under a repo-relative directory.
 * @param relDir - Directory relative to the repo root
 * @returns Repo-relative paths to the Live Sets found, sorted
 */
function findLiveSets(relDir: string): string[] {
  return readdirSync(path.join(projectRoot, relDir), { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith(".als"))
    .map((entry) => path.join(relDir, entry))
    .toSorted();
}

/**
 * Reads the schema version out of a Live Set.
 * @param alsPath - Absolute path to the .als
 * @returns The major/minor schema key, e.g. 123 for Live 12.3
 */
function readSchemaVersion(alsPath: string): number {
  // The stamp is in the first line, so inflating a slice is enough. Z_SYNC_FLUSH
  // makes zlib return what it has instead of rejecting the truncated stream.
  const header = gunzipSync(readFileSync(alsPath).subarray(0, 2048), {
    finishFlush: constants.Z_SYNC_FLUSH,
  }).toString("utf8");
  const tag = ABLETON_TAG.exec(header)?.[0];

  if (tag == null) {
    throw new Error(`${alsPath}: no <Ableton> element in the first 2KB`);
  }

  const minorVersion = MINOR_VERSION_ATTR.exec(tag)?.[1];

  if (minorVersion == null) {
    throw new Error(`${alsPath}: <Ableton> element has no MinorVersion`);
  }

  return parseSchemaVersion(minorVersion);
}

/**
 * Turns a MinorVersion stamp into a comparable major/minor key.
 * @param minorVersion - The MinorVersion attribute, e.g. "12.0_12300"
 * @returns The key, e.g. 123
 */
function parseSchemaVersion(minorVersion: string): number {
  const match = MINOR_VERSION_FORMAT.exec(minorVersion);

  if (match == null) {
    throw new Error(`Unrecognized MinorVersion stamp: "${minorVersion}"`);
  }

  const major = Number(match[1]);
  const code = Number(match[2]);

  if (Math.floor(code / 1000) !== major) {
    throw new Error(
      `MinorVersion "${minorVersion}" disagrees with itself about the major version`,
    );
  }

  return Math.floor(code / 100);
}

/**
 * Turns MIN_LIVE_VERSION into the same key parseSchemaVersion returns.
 * @param version - A "major.minor.patch" version string
 * @returns The key, e.g. 123 for "12.3.0"
 */
function parseMinLiveVersion(version: string): number {
  const [major, minor] = version.split(".").map(Number);

  // The 5-digit code packs the minor version into one digit, so both sides of
  // the comparison break at minor 10 — and an unparsed stamp would throw first.
  if (major == null || minor == null || minor > 9) {
    throw new Error(
      `Cannot encode MIN_LIVE_VERSION "${version}" as a schema key`,
    );
  }

  return major * 10 + minor;
}
