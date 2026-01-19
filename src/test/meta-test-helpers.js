import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {string} Project root directory */
export const projectRoot = path.resolve(__dirname, "../..");

/**
 * Recursively find folders exceeding an item limit
 * @param {string} dirPath - Directory to scan
 * @param {string[]} excludeDirs - Directory names to exclude
 * @param {number} maxItems - Maximum items allowed per folder
 * @param {Set<string>} [ignoreItems] - Items to ignore in count
 * @returns {Array<{path: string, count: number}>} Folders over limit
 */
export function findOversizedFolders(
  dirPath,
  excludeDirs,
  maxItems,
  ignoreItems = new Set([".DS_Store"]),
) {
  const results = [];
  const items = fs
    .readdirSync(dirPath)
    .filter((item) => !ignoreItems.has(item));

  if (items.length > maxItems) {
    results.push({
      path: path.relative(projectRoot, dirPath),
      count: items.length,
    });
  }

  for (const item of items) {
    if (excludeDirs.includes(item)) continue;

    const fullPath = path.join(dirPath, item);

    if (fs.statSync(fullPath).isDirectory()) {
      results.push(
        ...findOversizedFolders(fullPath, excludeDirs, maxItems, ignoreItems),
      );
    }
  }

  return results;
}

/**
 * Assert that no folders exceed the item limit, with a detailed failure message
 * @param {string} dirPath - Directory to check
 * @param {number} maxItems - Maximum items allowed
 * @param {typeof import("vitest").expect} expect - Vitest expect function
 */
export function assertFolderSizeLimit(dirPath, maxItems, expect) {
  if (!fs.existsSync(dirPath)) return;

  const oversized = findOversizedFolders(dirPath, ["node_modules"], maxItems);

  if (oversized.length > 0) {
    const details = oversized
      .map((f) => `  - ${f.path}: ${f.count} items`)
      .join("\n");

    expect.fail(
      `Found ${oversized.length} folder(s) exceeding ${maxItems} items:\n${details}\n\n` +
        `Consider splitting these folders into subdirectories.`,
    );
  }
}

/**
 * @typedef {object} SuppressionLimitConfig
 * @property {RegExp} pattern - Pattern to match
 * @property {Record<string, number>} limits - Per-tree limits
 * @property {string} errorSuffix - Message to show on failure
 */

/**
 * Count pattern occurrences in files and return matches
 * @param {string[]} files - Files to search
 * @param {RegExp} pattern - Pattern to match
 * @returns {Array<{file: string, line: number, match: string}>} Matches found
 */
export function countPatternOccurrences(files, pattern) {
  const matches = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (pattern.test(line)) {
        matches.push({
          file: path.relative(projectRoot, file),
          line: i + 1,
          match: line.trim(),
        });
      }
    }
  }

  return matches;
}

/** @type {Set<string>} Source file extensions */
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx"]);

/** @type {string[]} Test file patterns */
const TEST_FILE_PATTERNS = [
  ".test.js",
  ".test.ts",
  ".test.tsx",
  "-test-helpers.js",
];

/**
 * Checks if a filename is a test file based on patterns
 * @param {string} filename - File name to check
 * @returns {boolean} True if it's a test file
 */
export function isTestFile(filename) {
  return TEST_FILE_PATTERNS.some((pattern) => filename.endsWith(pattern));
}

/**
 * Recursively find all source files in a directory
 * @param {string} dirPath - Directory to scan
 * @param {boolean} [excludeTests] - Whether to exclude test files
 * @returns {string[]} Array of file paths
 */
export function findSourceFiles(dirPath, excludeTests = false) {
  const results = [];

  if (!fs.existsSync(dirPath)) return results;

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    if (item === "node_modules") continue;

    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...findSourceFiles(fullPath, excludeTests));
    } else if (SOURCE_EXTENSIONS.has(path.extname(item))) {
      if (excludeTests && isTestFile(item)) continue;
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Assert that pattern occurrences don't exceed limits
 * @param {string} tree - Tree name (e.g., "src", "webui")
 * @param {RegExp} pattern - Pattern to match
 * @param {number} limit - Maximum allowed occurrences
 * @param {string} errorSuffix - Message suffix for failures
 * @param {typeof import("vitest").expect} expect - Vitest expect function
 */
export function assertPatternLimit(tree, pattern, limit, errorSuffix, expect) {
  const treePath = path.join(projectRoot, tree);
  const files = findSourceFiles(treePath, true); // excludeTests=true
  const matches = countPatternOccurrences(files, pattern);

  if (matches.length > limit) {
    const details = matches.map((m) => `  - ${m.file}:${m.line}`).join("\n");

    expect.fail(
      `Found ${matches.length} ${pattern.source} in ${tree}/ (max: ${limit}):\n${details}\n\n${errorSuffix}`,
    );
  }
}
