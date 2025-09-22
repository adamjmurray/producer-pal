#!/usr/bin/env node
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

// Clean release directory
const releaseDir = join(rootDir, "release");
if (existsSync(releaseDir)) {
  console.log("Cleaning release directory...");
  rmSync(releaseDir, { recursive: true });
}
mkdirSync(releaseDir);

// Build
console.log("Building desktop extension...");
execSync("npm run build", { cwd: rootDir, stdio: "inherit" });

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
console.log("5. Continue with git merge and tag steps (see DEVELOPERS.md)");
