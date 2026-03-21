// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print functions for LOC statistics tables (CLI and markdown formats).
 */

import { styleText } from "node:util";
import {
  type CountStats,
  type GroupStats,
  type LangStats,
  CATEGORIES,
  GROUPS,
} from "./loc.ts";

/** Function that applies ANSI styling to a string. */
type Styler = (s: string) => string;

/**
 * Compute totals across all stat rows.
 * @param rows - Array of stats objects with numeric count fields
 * @returns Summed files, blank, comment, and code
 */
function computeTotals(rows: CountStats[]): CountStats {
  return rows.reduce(
    (acc, r) => ({
      files: acc.files + r.files,
      blank: acc.blank + r.blank,
      comment: acc.comment + r.comment,
      code: acc.code + r.code,
    }),
    { files: 0, blank: 0, comment: 0, code: 0 },
  );
}

/**
 * Build a CLI row formatter for the given column widths.
 * @param colWidths - Widths for each column (left-pad for all except first which is right-pad)
 * @param dimIndices - Column indices to render in dim gray (e.g., blank and comment)
 * @returns A function that formats values into an aligned row with styling
 */
function makeCliRow(
  colWidths: number[],
  dimIndices: Set<number>,
): (values: string[], color?: Styler) => string {
  /**
   * Apply dim gray styling.
   * @param s - Text to dim
   * @returns Dimmed text
   */
  const dim: Styler = (s) => styleText("gray", s);

  return (values: string[], color: Styler = (s) => s): string =>
    colWidths
      .map((w, i) => {
        const val = values[i] ?? "";
        const padded = i === 0 ? val.padEnd(w) : val.padStart(w);

        return dimIndices.has(i) ? dim(padded) : color(padded);
      })
      .join("  ");
}

/**
 * Build a separator line for CLI tables.
 * @param colWidths - Widths for each column
 * @returns Dashed separator string
 */
function makeCliSep(colWidths: number[]): string {
  return colWidths.map((w) => "-".repeat(w)).join("  ");
}

/**
 * Print a CLI-formatted group/category table with aligned columns and colors.
 * @param groups - Aggregated stats per group
 */
export function printCliGroupTable(groups: GroupStats[]): void {
  const totals = computeTotals(groups);
  const totalFuncs = groups.reduce((sum, g) => sum + g.functions, 0);

  const widths = [
    Math.max("Group".length, ...GROUPS.map((g) => g.length)),
    Math.max("Category".length, ...CATEGORIES.map((c) => c.length)),
    ...numColWidths(totals, totalFuncs),
  ];

  // Blank=4, Comment=5 are dim
  const row = makeCliRow(widths, new Set([4, 5]));
  const sep = makeCliSep(widths);

  const title = "Lines of Code by Group";

  console.log(`\n${styleText("bold", title)}`);
  console.log("=".repeat(title.length));
  console.log();
  console.log(
    row(["Group", "Category", "Files", "Funcs", "Blank", "Comment", "Code"]),
  );
  console.log(sep);

  for (const g of groups) {
    const color: Styler =
      g.category === "test"
        ? (s) => styleText("magenta", s)
        : (s) => styleText("green", s);

    console.log(
      row(
        [
          g.group,
          g.category,
          fmt(g.files),
          fmt(g.functions),
          fmt(g.blank),
          fmt(g.comment),
          fmt(g.code),
        ],
        color,
      ),
    );
  }

  console.log(sep);
  printCliTotals(row, [
    "Total",
    "",
    fmt(totals.files),
    fmt(totalFuncs),
    fmt(totals.blank),
    fmt(totals.comment),
    fmt(totals.code),
  ]);
}

/**
 * Print a markdown-formatted group/category table.
 * @param groups - Aggregated stats per group
 */
export function printMarkdownGroupTable(groups: GroupStats[]): void {
  const totals = computeTotals(groups);
  const totalFuncs = groups.reduce((sum, g) => sum + g.functions, 0);

  console.log("\n## Lines of Code by Group\n");
  console.log(
    mdRow("Group", "Category", "Files", "Funcs", "Blank", "Comment", "Code"),
  );
  console.log("| :-- | :-- | --: | --: | --: | --: | --: |");

  for (const g of groups) {
    console.log(
      mdRow(
        g.group,
        g.category,
        fmt(g.files),
        fmt(g.functions),
        fmt(g.blank),
        fmt(g.comment),
        fmt(g.code),
      ),
    );
  }

  printMdTotals(totals, "", totalFuncs);
}

/**
 * Print a CLI-formatted language breakdown table.
 * @param langs - Stats per language
 */
/** Programming languages — green in CLI. */
const CODE_LANGUAGES = new Set(["TypeScript", "JavaScript", "peggy"]);

/** Web languages — cyan in CLI. */
const WEB_LANGUAGES = new Set(["HTML", "CSS"]);

/**
 * Get the CLI color styler for a language.
 * @param language - Language name from cloc
 * @returns Styler function for the language category
 */
function langColor(language: string): Styler {
  if (CODE_LANGUAGES.has(language)) return (s) => styleText("green", s);
  if (WEB_LANGUAGES.has(language)) return (s) => styleText("cyan", s);

  return (s) => s;
}

/**
 * Print a CLI-formatted language breakdown table.
 * @param langs - Stats per language
 */
export function printCliLangTable(langs: LangStats[]): void {
  const totals = computeTotals(langs);
  const totalFuncs = langs.reduce((sum, l) => sum + l.functions, 0);

  const widths = [
    Math.max("Language".length, ...langs.map((l) => l.language.length)),
    ...numColWidths(totals, totalFuncs),
  ];

  // Blank=3, Comment=4 are dim
  const row = makeCliRow(widths, new Set([3, 4]));
  const sep = makeCliSep(widths);

  const title = "Lines of Code by Language";

  console.log(`\n${styleText("bold", title)}`);
  console.log("=".repeat(title.length));
  console.log();
  console.log(row(["Language", "Files", "Funcs", "Blank", "Comment", "Code"]));
  console.log(sep);

  for (const l of langs) {
    console.log(
      row(
        [
          l.language,
          fmt(l.files),
          fmt(l.functions),
          fmt(l.blank),
          fmt(l.comment),
          fmt(l.code),
        ],
        langColor(l.language),
      ),
    );
  }

  console.log(sep);
  printCliTotals(row, [
    "Total",
    fmt(totals.files),
    fmt(totalFuncs),
    fmt(totals.blank),
    fmt(totals.comment),
    fmt(totals.code),
  ]);
}

/**
 * Print a markdown-formatted language breakdown table.
 * @param langs - Stats per language
 */
export function printMarkdownLangTable(langs: LangStats[]): void {
  const totals = computeTotals(langs);
  const totalFuncs = langs.reduce((sum, l) => sum + l.functions, 0);

  console.log("\n## Lines of Code by Language\n");
  console.log(mdRow("Language", "Files", "Funcs", "Blank", "Comment", "Code"));
  console.log("| :-- | --: | --: | --: | --: | --: |");

  for (const l of langs) {
    console.log(
      mdRow(
        l.language,
        fmt(l.files),
        fmt(l.functions),
        fmt(l.blank),
        fmt(l.comment),
        fmt(l.code),
      ),
    );
  }

  printMdTotals(totals, undefined, totalFuncs);
}

/**
 * Print a red separator line between tables (CLI only).
 */
export function printCliSeparator(): void {
  console.log(styleText("red", "\n" + "─".repeat(60)));
}

/**
 * Print a styled CLI totals row.
 * @param row - Row formatter function
 * @param values - Column values for the totals row
 */
function printCliTotals(
  row: (values: string[], color?: Styler) => string,
  values: string[],
): void {
  console.log(row(values, (s) => styleText(["yellow", "bold"], s)));
}

/**
 * Print a bold markdown totals row.
 * @param totals - Aggregated count stats
 * @param extraCol - Optional extra column value (e.g., empty category column)
 * @param funcTotal - Optional function count total to append
 */
function printMdTotals(
  totals: CountStats,
  extraCol?: string,
  funcTotal?: number,
): void {
  /**
   * Wrap a number in markdown bold.
   * @param n - Number to format
   * @returns Bold-formatted number string
   */
  const bold = (n: number): string => `**${fmt(n)}**`;
  const cells = [
    "**Total**",
    ...(extraCol != null ? [extraCol] : []),
    bold(totals.files),
    ...(funcTotal != null ? [bold(funcTotal)] : []),
    bold(totals.blank),
    bold(totals.comment),
    bold(totals.code),
  ];

  console.log(mdRow(...cells));
  console.log();
}

/**
 * Compute column widths for Files, Funcs, Blank, Comment, Code.
 * @param totals - Totals row (has the widest numbers for most columns)
 * @param totalFuncs - Total function count
 * @returns Array of 5 column widths
 */
function numColWidths(totals: CountStats, totalFuncs: number): number[] {
  return [
    Math.max("Files".length, fmt(totals.files).length),
    Math.max("Funcs".length, fmt(totalFuncs).length),
    Math.max("Blank".length, fmt(totals.blank).length),
    Math.max("Comment".length, fmt(totals.comment).length),
    Math.max("Code".length, fmt(totals.code).length),
  ];
}

/**
 * Format a markdown table row.
 * @param cells - Cell values
 * @returns Pipe-delimited markdown row
 */
function mdRow(...cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/**
 * Format a number with comma separators.
 * @param n - Number to format
 * @returns Formatted string
 */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
