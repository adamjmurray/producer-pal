#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BumpType,
  nextVersion,
  parseVersion,
} from "./helpers/next-version.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const USAGE =
  "Usage: npm run version:bump:[patch|minor|major|rc|ga]\n" +
  "       npm run version:bump:to -- X.Y.Z[-rcN]";

const [, , mode = "patch", target] = process.argv;

const currentVersion = readPackageVersion(join(rootDir, "package.json"));

// The version string ships inside the artifact, so a bump is not just a git
// bookkeeping step — it decides what the built device calls itself and what
// every install of it compares against GitHub's latest release.
let newVersion: string;

try {
  if (mode === "to") {
    if (target == null) {
      throw new Error(`A target version is required.\n${USAGE}`);
    }

    // The escape hatch: no ordering rules, so it can also move backwards (which
    // is how a GA version first acquires an -rcN suffix). It only checks shape.
    parseVersion(target);
    newVersion = target;
  } else if (isBumpType(mode)) {
    newVersion = nextVersion(currentVersion, mode);
  } else {
    throw new Error(`Unknown bump "${mode}".\n${USAGE}`);
  }
} catch (error) {
  console.error(
    `\n❌ ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

// Bump root package.json. `npm version` takes the literal version rather than
// major|minor|patch: those keywords mishandle a pre-release input (see
// helpers/next-version.ts), and this way one computation drives every file.
console.log(`Bumping ${currentVersion} → ${newVersion}...`);

try {
  execSync(`npm version ${newVersion} --no-git-tag-version`, {
    cwd: rootDir,
    stdio: "inherit",
  });
} catch (error) {
  console.error(
    `\n❌ Failed to bump root package.json version: ${String(error)}`,
  );
  process.exit(1);
}

// Update claude-desktop-extension/package.json
const dxtPkgPath = join(rootDir, "claude-desktop-extension/package.json");
const dxtPkg = JSON.parse(readFileSync(dxtPkgPath, "utf8"));

dxtPkg.version = newVersion;
writeFileSync(dxtPkgPath, JSON.stringify(dxtPkg, null, 2) + "\n");
console.log("✓ Updated claude-desktop-extension/package.json");

// Update claude-desktop-extension/package-lock.json
console.log("Updating claude-desktop-extension/package-lock.json...");

try {
  execSync("npm install", {
    cwd: join(rootDir, "claude-desktop-extension"),
    stdio: "inherit",
  });
} catch (error) {
  console.error(
    `\n❌ npm install failed in claude-desktop-extension: ${String(error)}`,
  );
  console.error("Already-modified files (revert if needed):");
  console.error("  - package.json");
  console.error("  - claude-desktop-extension/package.json");
  process.exit(1);
}

console.log("✓ Updated claude-desktop-extension/package-lock.json");

// Update config.ts (replace VERSION value, preserve all other content)
const versionPath = join(rootDir, "src/shared/config.ts");
const versionContent = readFileSync(versionPath, "utf8").replace(
  /export const VERSION = ".*"/,
  `export const VERSION = "${newVersion}"`,
);

writeFileSync(versionPath, versionContent);
console.log("✓ Updated src/shared/config.ts");

// Update npm/package.json
const npmPkgPath = join(rootDir, "npm/package.json");
const npmPkg = JSON.parse(readFileSync(npmPkgPath, "utf8"));

npmPkg.version = newVersion;
writeFileSync(npmPkgPath, JSON.stringify(npmPkg, null, 2) + "\n");
console.log("✓ Updated npm/package.json");

// Update npm/package-lock.json (npm package has no deps — this just syncs the
// version and metadata to the package.json we just wrote)
console.log("Updating npm/package-lock.json...");

try {
  execSync("npm install --package-lock-only --no-audit", {
    cwd: join(rootDir, "npm"),
    stdio: "inherit",
  });
} catch (error) {
  console.error(`\n❌ npm install failed in npm: ${String(error)}`);
  process.exit(1);
}

console.log("✓ Updated npm/package-lock.json");

console.log(`\n✅ Version bumped to ${newVersion}\n`);
console.log("Next, run:");
console.log("  npm run check");
console.log("  git add .");
console.log(`  git commit -m "Bump version to ${newVersion}"`);

// --- Helpers below ---

/**
 * Reads the version field out of a package.json, exiting if it is missing.
 * @param path - Absolute path to the package.json
 * @returns The version string
 */
function readPackageVersion(path: string): string {
  const pkg: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (
    pkg == null ||
    typeof pkg !== "object" ||
    !("version" in pkg) ||
    typeof pkg.version !== "string"
  ) {
    console.error(`\n❌ No version field in ${path}`);
    process.exit(1);
  }

  return pkg.version;
}

/**
 * Narrows a raw CLI argument to a bump keyword.
 * @param arg - The first CLI argument
 * @returns True when it names a bump nextVersion() understands
 */
function isBumpType(arg: string): arg is BumpType {
  return ["major", "minor", "patch", "rc", "ga"].includes(arg);
}
