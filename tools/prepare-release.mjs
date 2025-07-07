#!/usr/bin/env node
// tools/prepare-release.mjs
import { execSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

console.log("Preparing release...\n");

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

// Copy .dxt
const dxtSource = join(rootDir, "desktop-extension/Producer-Pal.dxt");
const dxtDest = join(releasesDir, "Producer-Pal.dxt");

if (!existsSync(dxtSource)) {
  console.error("❌ Error: Producer-Pal.dxt not found. Build may have failed.");
  process.exit(1);
}

copyFileSync(dxtSource, dxtDest);
console.log("\n✅ Copied Producer-Pal.dxt to releases/");

console.log("\n📋 Next steps:");
console.log("1. Open device/Producer-Pal.amxd in Max");
console.log("2. Click the freeze button");
console.log("3. Save as: releases/Producer-Pal.amxd");
console.log("4. Test both files work correctly");
console.log("5. Continue with git merge and tag steps (see DEVELOPERS.md)");
