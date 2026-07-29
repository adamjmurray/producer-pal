// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** The kind of move a bump makes. */
export type BumpType = "major" | "minor" | "patch" | "rc" | "ga";

/** A version split into parts. `rc` is null for a GA (non-pre-release) version. */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  rc: number | null;
}

// Every cycle starts at -rc1 and ends at GA, so `major`/`minor`/`patch` name the
// version you are heading toward rather than one you are publishing: each sets
// the numeric base and lands you on -rc1 of it. That is why they ignore a suffix
// that is already there — from 2.1.1-rc1, `minor` means "make it 2.2.0 instead",
// which is 2.2.0-rc1. `rc` and `ga` then move within that cycle.
//
// Do NOT delegate this to semver.inc(). It treats a pre-release as a release
// that already happened, so semver.inc("2.2.0-rc3", "patch") returns 2.2.0 — the
// base, i.e. a silent downgrade of the very thing you asked it to increment.
/**
 * Computes the version a bump moves to. Pure — no filesystem, no npm.
 * @param current - The version being bumped from
 * @param type - Which bump to apply
 * @returns The new version string
 * @throws If `current` is not X.Y.Z or X.Y.Z-rcN, or the move is meaningless
 *   from `current` (rc off a GA version, GA off a GA version)
 */
export function nextVersion(current: string, type: BumpType): string {
  const { major, minor, patch, rc } = parseVersion(current);

  switch (type) {
    case "major":
      return `${major + 1}.0.0-rc1`;

    case "minor":
      return `${major}.${minor + 1}.0-rc1`;

    case "patch":
      return `${major}.${minor}.${patch + 1}-rc1`;

    case "rc":
      if (rc == null) {
        throw new Error(
          `Cannot bump the rc number: ${current} is not a pre-release. ` +
            "Start a cycle with version:bump:patch, :minor or :major — each of " +
            "those appends -rc1.",
        );
      }

      return `${major}.${minor}.${patch}-rc${rc + 1}`;

    case "ga":
      if (rc == null) {
        throw new Error(
          `Cannot promote to GA: ${current} is already a GA version.`,
        );
      }

      return `${major}.${minor}.${patch}`;
  }
}

// rc0 is rejected on purpose: the first pre-release of a cycle is rc1, so an
// rc0 in a package.json means something wrote a version by hand and got it
// wrong. Nothing else is accepted either — the shipped artifact carries this
// string, and src/shared/tests/config.test.ts asserts the same shape.
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-rc([1-9]\d*))?$/;

/**
 * Parses a Producer Pal version string.
 * @param version - The version to parse
 * @returns The version's numeric parts, with the rc number or null
 * @throws If the string is not X.Y.Z or X.Y.Z-rcN
 */
export function parseVersion(version: string): ParsedVersion {
  const match = VERSION_PATTERN.exec(version.trim());

  if (match == null) {
    throw new Error(
      `Not a Producer Pal version: "${version}". Expected X.Y.Z or X.Y.Z-rcN.`,
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    rc: match[4] == null ? null : Number(match[4]),
  };
}
