#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

// Its own step on purpose, run by hand between `npm run release` and creating
// the GitHub release. A tag says "these bytes are this version"; making it a
// build side effect would say that before anyone had opened the build. The
// artifacts are gitignored, so building first costs the tag nothing.
//
// This creates the tag locally and stops. Pushing is the irreversible half —
// once a tag is on the remote, testers can be holding it.
const pkg: unknown = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
);
const version =
  pkg != null && typeof pkg === "object" && "version" in pkg
    ? String(pkg.version)
    : fail("No version field in package.json.");
const tag = `v${version}`;

// The build reads its version from config.ts, not package.json, so this is the
// one disagreement that would put a tag on artifacts calling themselves
// something else. src/test/meta/versions/version-agreement.test.ts holds the full
// inventory; this checks the one copy that decides what was just built.
const configSource = readFileSync(
  join(rootDir, "src/shared/config.ts"),
  "utf8",
);
const configVersion = /export const VERSION = "([^"]*)"/.exec(
  configSource,
)?.[1];

if (configVersion !== version) {
  fail(
    `src/shared/config.ts says ${String(configVersion)}, package.json says ${version}.`,
    `The build identifies itself as ${String(configVersion)}, so ${tag} would name a version nothing was built as.`,
    `Fix with: npm run version:bump:to -- ${version}`,
  );
}

if (git("status", "--porcelain") !== "") {
  fail(
    "Working tree is not clean.",
    "Every build output is gitignored, so a clean tree after `npm run release`",
    "is the normal state — whatever is showing up here is a source change that",
    "the tag would not cover.",
  );
}

// What the previous flow had no way to check. Building and tagging are separate
// steps by design, so the tag can drift off the artifacts — commit something
// after the build and the tag points at code nothing was built from. It used to
// be worse than untidy: the update check resolved the release tag to a commit
// and compared it against the SHA baked into the build, so a tag one commit
// ahead made every installed copy think it had been superseded, permanently.
// That comparison is gone, but the tag should still mean what it says.
const build = readBuildInfo();

if (build == null) {
  fail(
    "Nothing has been built from this checkout.",
    "release/build-info.json is missing or unreadable (an interrupted release",
    "can leave it truncated). Run `npm run release` first — this",
    "tags a build you have already looked at, so there has to be one.",
  );
}

if (build.version !== version) {
  fail(
    `The build in release/ is ${build.version}, but package.json says ${version}.`,
    `The version moved after the build, so ${tag} would name artifacts that do`,
    "not exist. Rebuild: npm run release",
  );
}

const head = git("rev-parse", "--short=7", "HEAD");

if (build.commit !== head) {
  fail(
    `The build in release/ came from ${build.commit}, but HEAD is ${head}.`,
    "Something was committed after the build, so the tag would point at code",
    "the artifacts were not built from. Rebuild: npm run release",
  );
}

if (git("tag", "--list", tag) !== "") {
  fail(
    `${tag} already exists locally.`,
    "If the build changed, do not move the tag — bump to the next candidate",
    "(npm run version:bump:rc) so the new artifacts carry a version that says",
    "so. Moving a tag leaves testers holding files nothing can distinguish.",
  );
}

if (existsOnRemote(tag)) {
  fail(
    `${tag} already exists on origin.`,
    "That release was already cut. Bump to the next candidate instead:",
    "npm run version:bump:rc",
  );
}

// -s signs it, which makes it annotated, which is why -m is required.
gitInteractive("tag", "-s", "-m", tag, tag);

console.log(
  `\n✅ Created ${tag} at ${head}, the commit release/ was built from`,
);
console.log("\nPush it (nothing is public until you do):");
console.log(`   git push origin HEAD ${tag}\n`);

// --- Helpers below ---

interface BuildInfo {
  version: string;
  commit: string;
}

/**
 * Reads what the last `npm run release` recorded about its build.
 * @returns The build's version and commit, or null if nothing has been built
 */
function readBuildInfo(): BuildInfo | null {
  let parsed: unknown;

  try {
    // Parse inside the try as well: an interrupted `npm run release` can leave a
    // truncated build-info.json, and a raw SyntaxError stack here would replace
    // the caller's polished fail() message.
    parsed = JSON.parse(
      readFileSync(join(rootDir, "release/build-info.json"), "utf8"),
    );
  } catch {
    return null;
  }

  if (
    parsed == null ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    !("commit" in parsed)
  ) {
    return null;
  }

  return { version: String(parsed.version), commit: String(parsed.commit) };
}

/**
 * Runs a git command and captures its output.
 * @param args - Arguments to pass to git
 * @returns The trimmed stdout
 */
function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Runs a git command with the terminal attached, for anything that may prompt
 * (signing a tag asks the GPG agent for a passphrase).
 * @param args - Arguments to pass to git
 */
function gitInteractive(...args: string[]): void {
  execFileSync("git", args, { cwd: rootDir, stdio: "inherit" });
}

/**
 * Checks whether a tag is already published on origin.
 * @param name - The tag name
 * @returns True if origin has it; false if it doesn't, or can't be reached
 */
function existsOnRemote(name: string): boolean {
  try {
    return git("ls-remote", "--tags", "origin", `refs/tags/${name}`) !== "";
  } catch {
    // Offline, or no origin. The local check above still applies, and pushing
    // a tag that already exists is rejected by the remote anyway.
    console.log(`(Could not reach origin to check for ${name}.)`);

    return false;
  }
}

/**
 * Prints a failure and exits.
 * @param lines - The first line is the headline; the rest are indented detail
 * @returns Never — the process exits
 */
function fail(...lines: string[]): never {
  console.error(`\n❌ ${lines[0]}`);

  for (const line of lines.slice(1)) {
    console.error(`   ${line}`);
  }

  console.error("");
  process.exit(1);
}
