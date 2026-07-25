#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

console.log("Preparing release...\n");

// Check if we're on a tagged commit
try {
  const currentTag = execSync(
    "git describe --exact-match --tags HEAD 2>/dev/null",
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    },
  ).trim();

  console.log(`✓ Building from tag: ${currentTag}\n`);
} catch {
  console.log("⚠️  WARNING: Not on a tagged commit!");
  console.log("   Releases should be built from tagged commits.");
  console.log('   Run: git tag -s -m "vX.Y.Z" vX.Y.Z\n');
}

// Get version from package.json
const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));

// Resolve the build identity here and pass it into the build. The update check
// compares this against the commit the release tag points at, which is how a
// re-cut release is told apart from the copy testers already downloaded — so
// the release tag MUST end up on this exact commit.
let buildSha: string;

try {
  buildSha = execSync("git rev-parse --short=7 HEAD", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
} catch (error) {
  console.error(`\n❌ Could not resolve the build SHA: ${String(error)}`);
  console.error("   Releases must be built from a git checkout.");
  process.exit(1);
}

console.log(`Building version: ${pkg.version} (build ${buildSha})\n`);

// Clean release directory
const releaseDir = join(rootDir, "release");

if (existsSync(releaseDir)) {
  console.log("Cleaning release directory...");
  rmSync(releaseDir, { recursive: true });
}

mkdirSync(releaseDir);

// Build
console.log("Building desktop extension...");

try {
  execSync("npm run build", {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, BUILD_SHA: buildSha },
  });
} catch (error) {
  console.error(`\n❌ Build failed: ${String(error)}`);
  console.error("Release directory was created but contains no artifacts.");
  process.exit(1);
}

// Copy .mcpb file
const dxtSource = join(rootDir, "claude-desktop-extension/Producer_Pal.mcpb");
const dxtDest = join(releaseDir, "Producer_Pal.mcpb");

if (!existsSync(dxtSource)) {
  console.error(
    "❌ Error: Producer_Pal.mcpb not found. Build may have failed.",
  );
  process.exit(1);
}

copyFileSync(dxtSource, dxtDest);
console.log("\n✅ Copied Producer_Pal.mcpb to release/");

console.log("\n📋 Next steps:");
console.log("1. Open max-for-live-device/Producer_Pal.amxd in Max");
console.log("2. Click the freeze button");
console.log("3. Save as: release/Producer_Pal.amxd");
console.log("4. Test both files work correctly");
console.log(
  "5. Create/update the GitHub release, test, and proceed per dev/Releasing.md",
);
console.log(
  `\n🔖 These files identify themselves as build ${buildSha}. The release tag must\n` +
    "   point at that commit, or the update check can't tell them apart from an\n" +
    "   earlier download (see dev/Releasing.md).\n",
);
