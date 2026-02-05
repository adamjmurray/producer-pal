// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExpectStatic } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Project root directory */
export const projectRoot: string = path.resolve(__dirname, "../../..");

interface OversizedFolder {
  path: string;
  count: number;
}

/**
 * Recursively find folders exceeding an item limit
 * @param dirPath - Directory to scan
 * @param excludeDirs - Directory names to exclude
 * @param maxItems - Maximum items allowed per folder
 * @param ignoreItems - Items to ignore in count
 * @returns Folders over limit
 */
export function findOversizedFolders(
  dirPath: string,
  excludeDirs: string[],
  maxItems: number,
  ignoreItems: Set<string> = new Set([".DS_Store"]),
): OversizedFolder[] {
  const results: OversizedFolder[] = [];
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
 * @param dirPath - Directory to check
 * @param maxItems - Maximum items allowed
 * @param expect - Vitest expect function
 */
export function assertFolderSizeLimit(
  dirPath: string,
  maxItems: number,
  expect: ExpectStatic,
): void {
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

interface PatternMatch {
  file: string;
  line: number;
  match: string;
}

/**
 * Count pattern occurrences in files and return matches
 * @param files - Files to search
 * @param pattern - Pattern to match
 * @returns Matches found
 */
export function countPatternOccurrences(
  files: string[],
  pattern: RegExp,
): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line && pattern.test(line)) {
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

/** Source file extensions */
const SOURCE_EXTENSIONS: Set<string> = new Set([".js", ".mjs", ".ts", ".tsx"]);

/** Test file patterns */
const TEST_FILE_PATTERNS: string[] = [
  ".test.js",
  ".test.ts",
  ".test.tsx",
  "-test-helpers.js",
  "-test-helpers.ts",
];

/**
 * Checks if a filename is a test file based on patterns
 * @param filename - File name to check
 * @returns True if it's a test file
 */
export function isTestFile(filename: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => filename.endsWith(pattern));
}

/**
 * Recursively find all source files in a directory
 * @param dirPath - Directory to scan
 * @param excludeTests - Whether to exclude test files
 * @returns Array of file paths
 */
export function findSourceFiles(
  dirPath: string,
  excludeTests: boolean = false,
): string[] {
  const results: string[] = [];

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
 * Recursively find all test files in a directory
 * @param dirPath - Directory to scan
 * @returns Array of test file paths
 */
export function findTestFiles(dirPath: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dirPath)) return results;

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    if (item === "node_modules") continue;

    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(item)) && isTestFile(item)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Assert that pattern occurrences don't exceed limits
 * @param tree - Tree name (e.g., "src", "srcTests", "webui")
 * @param pattern - Pattern to match
 * @param limit - Maximum allowed occurrences
 * @param errorSuffix - Message suffix for failures
 * @param expect - Vitest expect function
 */
export function assertPatternLimit(
  tree: string,
  pattern: RegExp,
  limit: number,
  errorSuffix: string,
  expect: ExpectStatic,
): void {
  // "srcTests" checks only test files in src/
  const isTestTree = tree.endsWith("Tests");
  const dirName = isTestTree ? tree.slice(0, -5) : tree;
  const treePath = path.join(projectRoot, dirName);
  const files = isTestTree
    ? findTestFiles(treePath)
    : findSourceFiles(treePath, true); // excludeTests=true for source trees
  const matches = countPatternOccurrences(files, pattern);

  if (matches.length > limit) {
    const details = matches.map((m) => `  - ${m.file}:${m.line}`).join("\n");

    expect.fail(
      `Found ${matches.length} ${pattern.source} in ${tree} (max: ${limit}):\n${details}\n\n${errorSuffix}`,
    );
  }
}
