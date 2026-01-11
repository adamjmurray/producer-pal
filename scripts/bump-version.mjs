#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

// Update npm/package.json
const npmPkgPath = join(rootDir, "npm/package.json");
const npmPkg = JSON.parse(readFileSync(npmPkgPath, "utf8"));

npmPkg.version = newVersion;
writeFileSync(npmPkgPath, JSON.stringify(npmPkg, null, 2) + "\n");
console.log("✓ Updated npm/package.json");

console.log(`\n✅ Version bumped to ${newVersion}\n`);
console.log("Next, run:");
console.log("  npm run check");
console.log("  git add .");
console.log(`  git commit -m "Bump version to ${newVersion}"`);
