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
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

console.log("Preparing release...\n");

// Deliberately does NOT expect a tag yet. Building comes first, tagging comes
// after the artifacts have been looked at (`npm run tag`) — see dev/Releasing.md.

// Get version from package.json
const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));

// Baked into the bundles and shown next to the version in the device UI. It is
// diagnostic only: which commit produced these bytes, for when a bug report and
// a version number disagree. The update check does not read it — the version
// string alone answers that now that every build carries its own -rcN.
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

// Building and tagging are separate steps so the tag lands on artifacts someone
// has looked at. The gap between them is the risk: a commit, or a version bump,
// made in between moves the tag off what was built without anything noticing.
// `npm run tag` reads this back and refuses in that case. Gitignored with the
// rest of release/.
writeFileSync(
  join(releaseDir, "build-info.json"),
  JSON.stringify({ version: pkg.version, commit: buildSha }, null, 2) + "\n",
);

console.log("\n📋 Next steps:");
console.log("1. Open max-for-live-device/Producer_Pal.amxd in Max");
console.log("2. Click the freeze button");
console.log("3. Save as: release/Producer_Pal.amxd");
console.log("4. Test both files work correctly");
console.log("5. Tag the release: npm run tag");
console.log(
  "6. Create the GitHub release, test, and proceed per dev/Releasing.md",
);
console.log(
  `\n🔖 These files call themselves ${pkg.version} (build ${buildSha}). If step 4 turns up\n` +
    "   anything, don't rebuild under the same number — npm run version:bump:rc,\n" +
    "   then build again, so the replacement is a version testers can name.\n",
);
