#!/usr/bin/env node
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const [, , versionType = "patch"] = process.argv;
if (!["major", "minor", "patch"].includes(versionType)) {
  console.error("Usage: npm run version:bump [major|minor|patch]");
  process.exit(1);
}

// Bump root package.json
console.log(`Bumping ${versionType} version...`);
execSync(`npm version ${versionType} --no-git-tag-version`, {
  cwd: rootDir,
  stdio: "inherit",
});

// Read new version
const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const newVersion = rootPkg.version;

// Update claude-desktop-extension/package.json
const dxtPkgPath = join(rootDir, "claude-desktop-extension/package.json");
const dxtPkg = JSON.parse(readFileSync(dxtPkgPath, "utf8"));
dxtPkg.version = newVersion;
writeFileSync(dxtPkgPath, JSON.stringify(dxtPkg, null, 2) + "\n");
console.log("✓ Updated claude-desktop-extension/package.json");

// Update claude-desktop-extension/package-lock.json
console.log("Updating claude-desktop-extension/package-lock.json...");
execSync("npm install", {
  cwd: join(rootDir, "claude-desktop-extension"),
  stdio: "inherit",
});
console.log("✓ Updated claude-desktop-extension/package-lock.json");

// Update version.js
const versionPath = join(rootDir, "src/shared/version.js");
const versionContent = `// Semantic versioning: major.minor.patch
// Currently in pre-release, working towards 1.0.0
export const VERSION = "${newVersion}";
`;
writeFileSync(versionPath, versionContent);
console.log("✓ Updated src/shared/version.js");

console.log(`\n✅ Version bumped to ${newVersion}\n`);
console.log("⚠️  Manual step required:");
console.log(`1. Open max-for-live-device/Producer_Pal.amxd in Max`);
console.log(`2. Update version display to: ${newVersion}`);
console.log(`3. Save the device (do NOT freeze yet)\n`);
console.log("Then run:");
console.log("  npm test");
console.log("  git add -A");
console.log(`  git commit -m "Bump version to ${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push origin dev v${newVersion}`);
