#!/usr/bin/env node
// tools/prepare-release.mjs
import { execSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

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
  console.log("   Run: git tag vX.Y.Z\n");
}

// Get version from package.json
const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
console.log(`Building version: ${pkg.version}\n`);

// Clean releases directory
const releasesDir = join(rootDir, "releases");
if (existsSync(releasesDir)) {
  console.log("Cleaning releases directory...");
  rmSync(releasesDir, { recursive: true });
}
mkdirSync(releasesDir);

// Build
console.log("Building desktop extension...");
execSync("npm run build", { cwd: rootDir, stdio: "inherit" });

// Copy .dxt files (both new and old filenames for transition)
const dxtSource = join(rootDir, "desktop-extension/Producer_Pal.dxt");
const dxtDestNew = join(releasesDir, "Producer_Pal.dxt");
const dxtDestOld = join(releasesDir, "Producer-Pal.dxt");

if (!existsSync(dxtSource)) {
  console.error("❌ Error: Producer_Pal.dxt not found. Build may have failed.");
  process.exit(1);
}

copyFileSync(dxtSource, dxtDestNew);
copyFileSync(dxtSource, dxtDestOld);
console.log("\n✅ Copied Producer_Pal.dxt to releases/ (both new and old filenames)");

console.log("\n📋 Next steps:");
console.log("1. Open device/Producer_Pal.amxd in Max");
console.log("2. Click the freeze button");
console.log("3. Save as: releases/Producer_Pal.amxd");
console.log("4. ALSO save as: releases/Producer-Pal.amxd (temporary - old filename)");
console.log("5. Test both files work correctly");
console.log("6. Continue with git merge and tag steps (see DEVELOPERS.md)");
console.log("\n⚠️  Note: Step 4 (dual filename) is temporary for the transition period");
