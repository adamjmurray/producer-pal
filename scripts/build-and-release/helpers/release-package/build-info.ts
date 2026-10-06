// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The tag and the release package both refuse to run against anything but the
// build `npm run release` recorded, so they share these checks.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** What `npm run release` records. */
export interface BuildInfo {
  version: string;
  commit: string;
}

/** Where the checkout stands now. */
export interface Checkout {
  head: string;
  treeClean: boolean;
}

/**
 * Read what the last `npm run release` recorded.
 *
 * @param releaseDir - The release/ folder
 * @returns The build's version and commit, or null when missing or unreadable
 */
export function readBuildInfo(releaseDir: string): BuildInfo | null {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(releaseDir, "build-info.json"), "utf8"),
    );

    if (
      parsed == null ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      !("commit" in parsed) ||
      typeof parsed.version !== "string" ||
      typeof parsed.commit !== "string" ||
      parsed.commit === ""
    ) {
      return null;
    }

    return { version: parsed.version, commit: parsed.commit };
  } catch {
    return null;
  }
}

/**
 * Read the checkout's HEAD and whether it has uncommitted changes.
 *
 * @param git - Runs a git command in the repo and returns its trimmed stdout
 * @returns The short HEAD commit and whether the tree is clean
 */
export function readCheckout(git: (...args: string[]) => string): Checkout {
  return {
    head: git("rev-parse", "--short=7", "HEAD"),
    treeClean: git("status", "--porcelain") === "",
  };
}

/**
 * Check that a build's recorded version is the one package.json declares.
 *
 * @param build - What build-info.json recorded, or null if unreadable
 * @param version - package.json's version
 * @returns Refusal lines (headline first), or null when they agree
 */
export function checkBuildVersion(
  build: BuildInfo | null,
  version: string,
): string[] | null {
  if (build == null) {
    return [
      "Nothing has been built from this checkout.",
      "release/build-info.json is missing or unreadable (an interrupted release",
      "can leave it truncated). Run `npm run release` first.",
    ];
  }

  if (build.version !== version) {
    return [
      `The build in release/ is ${build.version}, but package.json says ${version}.`,
      "The version moved after the build, so these artifacts don't carry it.",
      "Rebuild: npm run release",
    ];
  }

  return null;
}

/**
 * Check that the build in release/ came from the code in this checkout.
 *
 * @param options - The recorded build, package.json's version, and the checkout
 * @param options.build - What build-info.json recorded, or null if unreadable
 * @param options.version - package.json's version
 * @param options.checkout - HEAD and tree state now
 * @returns Refusal lines (headline first), or null when the build matches
 */
export function checkBuildMatchesCheckout(options: {
  build: BuildInfo | null;
  version: string;
  checkout: Checkout;
}): string[] | null {
  const { build, version, checkout } = options;

  if (!checkout.treeClean) {
    return [
      "Working tree is not clean.",
      "Every build output is gitignored, so a clean tree after `npm run release`",
      "is the normal state — whatever is showing up here is a source change that",
      "the build in release/ does not cover.",
    ];
  }

  const versionRefusal = checkBuildVersion(build, version);

  if (versionRefusal != null || build == null) {
    return versionRefusal;
  }

  if (build.commit !== checkout.head) {
    return [
      `The build in release/ came from ${build.commit}, but HEAD is ${checkout.head}.`,
      "Something was committed after the build, so the artifacts were not built",
      "from this code. Rebuild: npm run release",
    ];
  }

  return null;
}
