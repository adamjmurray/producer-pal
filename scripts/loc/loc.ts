#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print lines of code statistics with cloc-quality counting (files, blank,
 * comment, code) grouped by tree and test vs source.
 *
 * Requires cloc to be installed: https://github.com/AlDanial/cloc
 *
 * Usage:
 *   node scripts/loc/loc.ts              # CLI table (default)
 *   node scripts/loc/loc.ts --markdown   # Markdown table (for CI)
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  printCliDerivedStats,
  printMarkdownDerivedStats,
} from "./loc-derived-stats.ts";
import {
  printCliGroupTable,
  printCliLangTable,
  printCliSeparator,
  printMarkdownGroupTable,
  printMarkdownLangTable,
} from "./loc-printers.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

export const GROUPS = [
  "src",
  "webui",
  "scripts",
  "evals",
  "e2e",
  "config",
  "docs",
  "other",
] as const;

type Group = (typeof GROUPS)[number];

/** Maps top-level directories to their display group. */
const DIR_TO_GROUP: Record<string, Group> = {
  src: "src",
  webui: "webui",
  scripts: "scripts",
  evals: "evals",
  e2e: "e2e",
  config: "config",
  ".github": "config",
  ".vscode": "config",
  docs: "docs",
  dev: "docs",
};

/** Groups where test/source classification applies. */
export const CODE_GROUPS = new Set<Group>([
  "src",
  "webui",
  "scripts",
  "evals",
  "e2e",
]);

export const CATEGORIES = ["source", "test"] as const;

type Category = (typeof CATEGORIES)[number];

const TEST_FILE_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".test.js",
  "-test-helpers.ts",
  "-test-helpers.js",
  "-test-case.ts",
  ".spec.ts",
  ".spec.tsx",
];

const TEST_DIR_NAMES = new Set(["tests", "test-cases", "test-utils"]);

interface ClocFileEntry {
  blank: number;
  comment: number;
  code: number;
  language: string;
}

export interface CountStats {
  files: number;
  blank: number;
  comment: number;
  code: number;
}

export interface GroupStats extends CountStats {
  group: Group;
  category: Category;
  functions: number;
}

export interface LangStats extends CountStats {
  language: string;
}

/**
 * Run cloc, classify files, and print language + group tables.
 */
function main(): void {
  const markdown = process.argv.includes("--markdown");
  const clocData = runCloc();
  const funcCounts = countAllFunctions(clocData);
  const langs = aggregateByLanguage(clocData);
  const groups = aggregateByGroup(clocData, funcCounts);

  if (markdown) {
    printMarkdownLangTable(langs);
    printMarkdownGroupTable(groups);
    printMarkdownDerivedStats(groups);
  } else {
    printCliLangTable(langs);
    printCliSeparator();
    printCliGroupTable(groups);
    printCliSeparator();
    printCliDerivedStats(groups);
    console.log();
  }
}

/**
 * Run cloc with per-file JSON output and return parsed results.
 * @returns Map of file paths to their cloc stats
 */
function runCloc(): Record<string, ClocFileEntry> {
  let output: string;

  try {
    output = execSync(
      "cloc --by-file --json --vcs=git --not-match-f='package-lock.json|-parser\\.js$'",
      { cwd: PROJECT_ROOT, encoding: "utf8" },
    );
  } catch {
    console.error(
      "Error: cloc is not installed or failed to run.\n" +
        "Install it from https://github.com/AlDanial/cloc",
    );
    process.exit(1);
  }

  let data: Record<string, ClocFileEntry>;

  try {
    data = JSON.parse(output) as Record<string, ClocFileEntry>;
  } catch {
    console.error("Error: failed to parse cloc JSON output.");
    process.exit(1);
  }

  // Remove cloc metadata keys
  delete data.header;
  delete data.SUM;

  return data;
}

/**
 * Count functions in all git-tracked TS/TSX files from the cloc file list.
 * @param clocData - Per-file cloc results
 * @returns Map of clean file path to function count
 */
function countAllFunctions(
  clocData: Record<string, ClocFileEntry>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const filePath of Object.keys(clocData)) {
    const clean = filePath.replace(/^\.\//, "");

    if (TS_EXTENSIONS.has(path.extname(clean))) {
      counts.set(clean, countFunctionsInFile(path.join(PROJECT_ROOT, clean)));
    }
  }

  return counts;
}

/**
 * Aggregate cloc data by programming language, sorted by code descending.
 * @param clocData - Per-file cloc results
 * @returns Stats per language
 */
function aggregateByLanguage(
  clocData: Record<string, ClocFileEntry>,
): LangStats[] {
  const map = new Map<string, LangStats>();

  for (const entry of Object.values(clocData)) {
    let stats = map.get(entry.language);

    if (!stats) {
      stats = {
        language: entry.language,
        files: 0,
        blank: 0,
        comment: 0,
        code: 0,
      };
      map.set(entry.language, stats);
    }

    stats.files++;
    stats.blank += entry.blank;
    stats.comment += entry.comment;
    stats.code += entry.code;
  }

  return [...map.values()].sort((a, b) => b.code - a.code);
}

/**
 * Classify each file and aggregate stats by group and category.
 * @param clocData - Per-file cloc results
 * @param funcCounts - Pre-computed function counts per file
 * @returns Aggregated stats per group, ordered by group then category
 */
function aggregateByGroup(
  clocData: Record<string, ClocFileEntry>,
  funcCounts: Map<string, number>,
): GroupStats[] {
  /**
   * Build a map key from group and category.
   * @param group - Group name
   * @param category - Source or test
   * @returns Combined key string
   */
  const key = (group: Group, category: Category): string =>
    `${group}:${category}`;

  const map = new Map<string, GroupStats>();

  for (const group of GROUPS) {
    for (const category of CATEGORIES) {
      map.set(key(group, category), {
        group,
        category,
        files: 0,
        blank: 0,
        comment: 0,
        code: 0,
        functions: 0,
      });
    }
  }

  for (const [filePath, entry] of Object.entries(clocData)) {
    const classified = classifyFile(filePath);
    const stats = map.get(key(classified.group, classified.category));

    if (!stats) continue;

    accumulateEntry(stats, entry, filePath, funcCounts);
  }

  return [...map.values()].filter((g) => g.files > 0);
}

/**
 * Accumulate a cloc file entry into a stats object.
 * @param stats - Stats to update
 * @param entry - Cloc file entry
 * @param filePath - Raw file path from cloc (may start with "./")
 * @param funcCounts - Pre-computed function counts per clean path
 */
function accumulateEntry(
  stats: CountStats & { functions: number },
  entry: ClocFileEntry,
  filePath: string,
  funcCounts: Map<string, number>,
): void {
  const clean = filePath.replace(/^\.\//, "");

  stats.files++;
  stats.blank += entry.blank;
  stats.comment += entry.comment;
  stats.code += entry.code;
  stats.functions += funcCounts.get(clean) ?? 0;
}

/**
 * Classify a file path into its group and source/test category.
 * @param filePath - Relative file path from cloc (e.g., "./src/tools/clip/update-clip.ts")
 * @returns Group and category
 */
function classifyFile(filePath: string): { group: Group; category: Category } {
  // cloc --vcs=git paths start with "./"
  const clean = filePath.replace(/^\.\//, "");
  const segments = clean.split(path.sep);
  const topDir = segments[0] ?? "";
  const group: Group = DIR_TO_GROUP[topDir] ?? "other";

  let category: Category = "source";

  if (CODE_GROUPS.has(group)) {
    const filename = segments.at(-1) ?? "";
    const inTestDir = segments.some((seg) => TEST_DIR_NAMES.has(seg));

    if (inTestDir || isTestFileBySuffix(filename)) {
      category = "test";
    }
  }

  return { group, category };
}

/**
 * Check if a filename matches a test file suffix pattern.
 * @param filename - File name to check
 * @returns True if it matches a test suffix
 */
function isTestFileBySuffix(filename: string): boolean {
  return TEST_FILE_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

/** AST node kinds that count as functions (matching v8 coverage). */
const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Count function AST nodes in a TypeScript file.
 * @param filePath - Absolute path to the file
 * @returns Number of functions found
 */
function countFunctionsInFile(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    false,
  );

  let count = 0;

  /**
   * Recursively walk the AST and count function nodes.
   * @param node - Current AST node
   */
  const visit = (node: ts.Node): void => {
    if (FUNCTION_KINDS.has(node.kind)) count++;

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return count;
}

main();
