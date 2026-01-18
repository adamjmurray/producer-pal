import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

// Per-tree limits for lint suppressions (ratcheted to current counts)
const ESLINT_DISABLE_LIMITS = {
  src: 8,
  scripts: 0,
  webui: 5,
};

const TS_EXPECT_ERROR_LIMITS = {
  src: 0,
  scripts: 4, // Accessing private MCP SDK properties (_registeredTools, _serverVersion)
  webui: 5,
};

const TS_NOCHECK_LIMITS = {
  src: 38, // Ratcheted - remove @ts-nocheck by adding JSDoc type annotations
  scripts: 0,
  webui: 0,
};

const SOURCE_TREES = Object.keys(ESLINT_DISABLE_LIMITS);
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx"]);

// Exclude test files from eslint-disable count since they have relaxed rules per ESLint config
const TEST_FILE_PATTERNS = [
  ".test.js",
  ".test.ts",
  ".test.tsx",
  ".test-helpers.js",
];

/**
 * Checks if a filename is a test file based on patterns.
 * @param {string} filename - File name to check
 * @returns {boolean} True if it's a test file
 */
function isTestFile(filename) {
  return TEST_FILE_PATTERNS.some((pattern) => filename.endsWith(pattern));
}

/**
 * Recursively finds all source files in a directory, optionally excluding test files.
 * @param {string} dirPath - Directory to scan
 * @param {boolean} excludeTests - Whether to exclude test files
 * @returns {string[]} Array of file paths
 */
function findSourceFiles(dirPath, excludeTests = false) {
  const results = [];

  if (!fs.existsSync(dirPath)) {
    return results;
  }

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
 * Counts occurrences of a pattern in source files.
 * @param {string[]} files - Files to search
 * @param {RegExp} pattern - Pattern to match
 * @returns {Array<{file: string, line: number, match: string}>} Matches found
 */
function countPatternOccurrences(files, pattern) {
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

describe("Lint suppression limits", () => {
  // Test files are excluded because they have relaxed ESLint rules per config
  // and often need suppressions for mocking patterns (vi.mock, partial implementations)

  describe("eslint-disable comments (excluding test files)", () => {
    for (const tree of SOURCE_TREES) {
      const limit = ESLINT_DISABLE_LIMITS[tree];

      it(`should have at most ${limit} eslint-disable comments in ${tree}/`, () => {
        const treePath = path.join(projectRoot, tree);
        const files = findSourceFiles(treePath, true); // excludeTests=true
        const matches = countPatternOccurrences(files, /eslint-disable/);

        if (matches.length > limit) {
          const details = matches
            .map((m) => `  - ${m.file}:${m.line}`)
            .join("\n");

          // eslint-disable-next-line vitest/no-conditional-expect -- conditional provides detailed failure message
          expect.fail(
            `Found ${matches.length} eslint-disable comments in ${tree}/ (max: ${limit}):\n${details}\n\n` +
              `Consider fixing the underlying issues instead of suppressing lint rules.`,
          );
        }
      });
    }
  });

  describe("@ts-expect-error comments (excluding test files)", () => {
    for (const tree of SOURCE_TREES) {
      const limit = TS_EXPECT_ERROR_LIMITS[tree];

      it(`should have at most ${limit} @ts-expect-error comments in ${tree}/`, () => {
        const treePath = path.join(projectRoot, tree);
        const files = findSourceFiles(treePath, true); // excludeTests=true
        const matches = countPatternOccurrences(files, /@ts-expect-error/);

        if (matches.length > limit) {
          const details = matches
            .map((m) => `  - ${m.file}:${m.line}`)
            .join("\n");

          // eslint-disable-next-line vitest/no-conditional-expect -- conditional provides detailed failure message
          expect.fail(
            `Found ${matches.length} @ts-expect-error comments in ${tree}/ (max: ${limit}):\n${details}\n\n` +
              `Consider fixing the type issues or improving type definitions.`,
          );
        }
      });
    }
  });

  describe("@ts-nocheck comments (excluding test files)", () => {
    for (const tree of SOURCE_TREES) {
      const limit = TS_NOCHECK_LIMITS[tree];

      it(`should have at most ${limit} @ts-nocheck comments in ${tree}/`, () => {
        const treePath = path.join(projectRoot, tree);
        const files = findSourceFiles(treePath, true); // excludeTests=true
        const matches = countPatternOccurrences(files, /@ts-nocheck/);

        if (matches.length > limit) {
          const details = matches
            .map((m) => `  - ${m.file}:${m.line}`)
            .join("\n");

          // eslint-disable-next-line vitest/no-conditional-expect -- conditional provides detailed failure message
          expect.fail(
            `Found ${matches.length} @ts-nocheck comments in ${tree}/ (max: ${limit}):\n${details}\n\n` +
              `Add JSDoc type annotations and remove @ts-nocheck to enable type checking.`,
          );
        }
      });
    }
  });
});
