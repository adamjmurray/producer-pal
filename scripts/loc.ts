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
 *   node scripts/loc.ts              # CLI table (default)
 *   node scripts/loc.ts --markdown   # Markdown table (for CI)
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { styleText } from "node:util";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

const GROUPS = [
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
const CODE_GROUPS = new Set<Group>(["src", "webui", "scripts", "evals", "e2e"]);

const CATEGORIES = ["source", "test"] as const;

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

interface GroupStats {
  group: Group;
  category: Category;
  files: number;
  blank: number;
  comment: number;
  code: number;
}

/**
 * Run cloc, classify files by group and test/source, and print a table.
 */
function main(): void {
  const markdown = process.argv.includes("--markdown");
  const clocData = runCloc();
  const groups = aggregate(clocData);

  if (markdown) {
    printMarkdownTable(groups);
  } else {
    printCliTable(groups);
  }
}

/**
 * Run cloc with per-file JSON output and return parsed results.
 * @returns Map of file paths to their cloc stats
 */
function runCloc(): Record<string, ClocFileEntry> {
  const output = execSync(
    "cloc --by-file --json --vcs=git --not-match-f='package-lock.json|-parser\\.js$'",
    { cwd: PROJECT_ROOT, encoding: "utf8" },
  );

  const data = JSON.parse(output) as Record<string, ClocFileEntry>;

  // Remove cloc metadata keys
  delete data.header;
  delete data.SUM;

  return data;
}

/**
 * Classify each file and aggregate stats by tree and category.
 * @param clocData - Per-file cloc results
 * @returns Aggregated stats per group, ordered by tree then category
 */
function aggregate(clocData: Record<string, ClocFileEntry>): GroupStats[] {
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
      });
    }
  }

  for (const [filePath, entry] of Object.entries(clocData)) {
    const classified = classifyFile(filePath);
    const stats = map.get(key(classified.group, classified.category));

    if (!stats) continue;

    stats.files++;
    stats.blank += entry.blank;
    stats.comment += entry.comment;
    stats.code += entry.code;
  }

  return [...map.values()].filter((g) => g.files > 0);
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

/**
 * Compute totals across all groups.
 * @param groups - Aggregated stats per group
 * @returns Summed files, blank, comment, and code
 */
function computeTotals(groups: GroupStats[]): {
  files: number;
  blank: number;
  comment: number;
  code: number;
} {
  return groups.reduce(
    (acc, g) => ({
      files: acc.files + g.files,
      blank: acc.blank + g.blank,
      comment: acc.comment + g.comment,
      code: acc.code + g.code,
    }),
    { files: 0, blank: 0, comment: 0, code: 0 },
  );
}

/**
 * Print a CLI-formatted table with aligned columns.
 * @param groups - Aggregated stats per group
 */
function printCliTable(groups: GroupStats[]): void {
  const totals = computeTotals(groups);

  const cols = {
    group: Math.max("Group".length, ...GROUPS.map((g) => g.length)),
    cat: Math.max("Category".length, ...CATEGORIES.map((c) => c.length)),
    files: Math.max("Files".length, fmt(totals.files).length),
    blank: Math.max("Blank".length, fmt(totals.blank).length),
    comment: Math.max("Comment".length, fmt(totals.comment).length),
    code: Math.max("Code".length, fmt(totals.code).length),
  };

  /**
   * Apply dim gray styling to text.
   * @param s - Text to dim
   * @returns Styled text
   */
  const dim = (s: string): string => styleText("gray", s);

  /** Function that applies ANSI styling to a string. */
  type Styler = (s: string) => string;
  /**
   * Identity (no styling).
   * @param s - Text
   * @returns Unstyled text
   */
  const none: Styler = (s) => s;
  /**
   * Yellow bold styling for summary row.
   * @param s - Text to style
   * @returns Styled text
   */
  const summary: Styler = (s) => styleText(["yellow", "bold"], s);

  /**
   * Format a CLI table row. Pads plain text first, then applies color styling.
   * @param values - Column values: group, category, files, blank, comment, code
   * @param color - Optional color function for group, category, files, and code columns
   * @returns Formatted row string
   */
  const row = (values: string[], color: Styler = none): string =>
    [
      color(values[0]?.padEnd(cols.group) ?? ""),
      color(values[1]?.padEnd(cols.cat) ?? ""),
      color(values[2]?.padStart(cols.files) ?? ""),
      dim(values[3]?.padStart(cols.blank) ?? ""),
      dim(values[4]?.padStart(cols.comment) ?? ""),
      color(values[5]?.padStart(cols.code) ?? ""),
    ].join("  ");

  const sep = [
    "-".repeat(cols.group),
    "-".repeat(cols.cat),
    "-".repeat(cols.files),
    "-".repeat(cols.blank),
    "-".repeat(cols.comment),
    "-".repeat(cols.code),
  ].join("  ");

  console.log("\nLines of Code\n");
  console.log(row(["Group", "Category", "Files", "Blank", "Comment", "Code"]));
  console.log(sep);

  for (const g of groups) {
    const color: Styler =
      g.category === "test"
        ? (s) => styleText("cyan", s)
        : (s) => styleText("green", s);

    console.log(
      row(
        [
          g.group,
          g.category,
          fmt(g.files),
          fmt(g.blank),
          fmt(g.comment),
          fmt(g.code),
        ],
        color,
      ),
    );
  }

  console.log(sep);
  console.log(
    row(
      [
        "Total",
        "",
        fmt(totals.files),
        fmt(totals.blank),
        fmt(totals.comment),
        fmt(totals.code),
      ],
      summary,
    ),
  );

  console.log();
}

/**
 * Print a markdown-formatted table.
 * @param groups - Aggregated stats per group
 */
function printMarkdownTable(groups: GroupStats[]): void {
  const totals = computeTotals(groups);

  /**
   * Format a markdown table row.
   * @param cells - Cell values
   * @returns Pipe-delimited markdown row
   */
  const row = (...cells: string[]): string => `| ${cells.join(" | ")} |`;

  console.log("\n## Lines of Code\n");
  console.log(row("Group", "Category", "Files", "Blank", "Comment", "Code"));
  console.log("| :-- | :-- | --: | --: | --: | --: |");

  for (const g of groups) {
    console.log(
      row(
        g.group,
        g.category,
        fmt(g.files),
        fmt(g.blank),
        fmt(g.comment),
        fmt(g.code),
      ),
    );
  }

  console.log(
    row(
      "**Total**",
      "",
      `**${fmt(totals.files)}**`,
      `**${fmt(totals.blank)}**`,
      `**${fmt(totals.comment)}**`,
      `**${fmt(totals.code)}**`,
    ),
  );

  console.log();
}

/**
 * Format a number with comma separators.
 * @param n - Number to format
 * @returns Formatted string
 */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

main();
