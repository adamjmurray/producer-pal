import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

const MAX_ITEMS_PER_FOLDER = 12;

/**
 * Recursively scans directories and returns folders exceeding the item limit.
 * @param {string} dirPath - Directory to scan
 * @param {string[]} excludeDirs - Directory names to exclude
 * @returns {Array<{path: string, count: number}>} Folders over limit
 */
function findOversizedFolders(dirPath, excludeDirs = []) {
  const results = [];
  const items = fs.readdirSync(dirPath);

  // Check current directory
  if (items.length > MAX_ITEMS_PER_FOLDER) {
    results.push({
      path: path.relative(projectRoot, dirPath),
      count: items.length,
    });
  }

  // Recurse into subdirectories
  for (const item of items) {
    if (excludeDirs.includes(item)) continue;

    const fullPath = path.join(dirPath, item);
    if (fs.statSync(fullPath).isDirectory()) {
      results.push(...findOversizedFolders(fullPath, excludeDirs));
    }
  }

  return results;
}

describe("Folder size limits", () => {
  it("should enforce max 12 items per folder in src/", () => {
    const srcPath = path.join(projectRoot, "src");
    const oversized = findOversizedFolders(srcPath, ["node_modules"]);

    if (oversized.length > 0) {
      const details = oversized
        .map((f) => `  - ${f.path}: ${f.count} items`)
        .join("\n");
      expect.fail(
        `Found ${oversized.length} folder(s) exceeding ${MAX_ITEMS_PER_FOLDER} items:\n${details}\n\n` +
          `Consider splitting these folders into subdirectories.`,
      );
    }
  });

  it("should enforce max 12 items per folder in webui/src/", () => {
    const webuiSrcPath = path.join(projectRoot, "webui", "src");
    if (!fs.existsSync(webuiSrcPath)) return;

    const oversized = findOversizedFolders(webuiSrcPath, ["node_modules"]);

    if (oversized.length > 0) {
      const details = oversized
        .map((f) => `  - ${f.path}: ${f.count} items`)
        .join("\n");
      expect.fail(
        `Found ${oversized.length} folder(s) exceeding ${MAX_ITEMS_PER_FOLDER} items:\n${details}\n\n` +
          `Consider splitting these folders into subdirectories.`,
      );
    }
  });

  it("should enforce max 12 items per folder in scripts/", () => {
    const scriptsPath = path.join(projectRoot, "scripts");
    if (!fs.existsSync(scriptsPath)) return;

    const oversized = findOversizedFolders(scriptsPath, ["node_modules"]);

    if (oversized.length > 0) {
      const details = oversized
        .map((f) => `  - ${f.path}: ${f.count} items`)
        .join("\n");
      expect.fail(
        `Found ${oversized.length} folder(s) exceeding ${MAX_ITEMS_PER_FOLDER} items:\n${details}\n\n` +
          `Consider splitting these folders into subdirectories.`,
      );
    }
  });
});
