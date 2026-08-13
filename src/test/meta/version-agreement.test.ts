// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";

// One release version is spelled out many times over, and nothing at runtime
// reconciles the copies: whichever one a given artifact happens to read is the
// version that artifact claims to be. A stale copy is invisible until something
// built from it reports the wrong version — the npm portal announcing a version
// that was never released, or a device that keeps offering an update it already
// contains.
//
// scripts/build-and-release/bump-version.ts writes every copy. This test is the
// check that it did, which matters most for the case it cannot cover: a version
// edited by hand. The lists below ARE the inventory — deliberately not restated
// as a count anywhere, since a number in prose goes stale the first time a copy
// is added and nothing would catch it.
const PACKAGE_JSON_FILES = [
  "package.json",
  "claude-desktop-extension/package.json",
  "npm/package.json",
];

// npm keeps the version twice per lockfile — the top-level field and the root
// package entry. `npm install` syncs both; a hand-edit reliably misses one.
const LOCKFILE_FILES = [
  "package-lock.json",
  "claude-desktop-extension/package-lock.json",
  "npm/package-lock.json",
];

describe("version agreement", () => {
  const expected = readJsonField("package.json", (json) => json.version);

  it("root package.json holds a release or -rcN pre-release version", () => {
    expect(expected).toMatch(/^\d+\.\d+\.\d+(-rc[1-9]\d*)?$/);
  });

  it.each(PACKAGE_JSON_FILES)("%s matches", (file) => {
    expect(readJsonField(file, (json) => json.version)).toBe(expected);
  });

  it.each(LOCKFILE_FILES)("%s matches, in both places", (file) => {
    expect(readJsonField(file, (json) => json.version)).toBe(expected);
    expect(readJsonField(file, (json) => json.packages?.[""]?.version)).toBe(
      expected,
    );
  });

  it("src/shared/config.ts matches", () => {
    // The one copy that is not JSON: it ships inside the built V8 and Node
    // bundles, which have no package.json to read at runtime.
    const source = readFileSync(
      path.join(projectRoot, "src/shared/config.ts"),
      "utf8",
    );

    expect(/export const VERSION = "([^"]*)"/.exec(source)?.[1]).toBe(expected);
  });
});

interface VersionedJson {
  version?: unknown;
  packages?: Record<string, { version?: unknown } | undefined>;
}

/**
 * Reads one field out of a JSON file at a repo-relative path.
 * @param file - Path relative to the repo root
 * @param select - Picks the field out of the parsed JSON
 * @returns The selected value
 */
function readJsonField(
  file: string,
  select: (json: VersionedJson) => unknown,
): unknown {
  const json = JSON.parse(
    readFileSync(path.join(projectRoot, file), "utf8"),
  ) as VersionedJson;

  return select(json);
}
