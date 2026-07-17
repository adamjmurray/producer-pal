// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Table rendering and value formatting shared by the stats reports
 * (test-stats, e2e-stats). Each report builds pre-formatted string rows and
 * hands them here to render as an aligned CLI table or a markdown table.
 */

import { styleText } from "node:util";

/** A table row, pre-formatted for display. */
export type Row = string[];

/**
 * Print an aligned, colored CLI table.
 * @param headers - Column headers
 * @param rows - Display rows
 * @param summaryIdx - Row index to highlight as a summary row, if any
 */
export function printCliTable(
  headers: string[],
  rows: Row[],
  summaryIdx = -1,
): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );

  /**
   * Pad and color one row.
   * @param values - Cell values
   * @param color - Styler to apply
   * @returns Aligned row string
   */
  const line = (values: Row, color: (s: string) => string): string =>
    widths
      .map((w, i) => {
        const val = values[i] ?? "";

        return color(i === 0 ? val.padEnd(w) : val.padStart(w));
      })
      .join("  ");

  console.log(line(headers, (s) => s));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));

  for (const [i, row] of rows.entries()) {
    const color =
      i === summaryIdx
        ? (s: string): string => styleText(["yellow", "bold"], s)
        : (s: string): string => styleText("green", s);

    console.log(line(row, color));
  }
}

/**
 * Print a bold CLI title with an underline.
 * @param title - Title text
 */
export function printCliTitle(title: string): void {
  console.log(`\n${styleText("bold", title)}`);
  console.log("=".repeat(title.length));
  console.log();
}

/**
 * Print a dim CLI note, with markdown backticks stripped.
 * @param note - Note text, possibly containing markdown backticks
 */
export function printCliNote(note: string): void {
  console.log(`\n${styleText("gray", note.replaceAll("`", ""))}`);
}

/**
 * Print a markdown table with a left-aligned first column.
 * @param headers - Column headers
 * @param rows - Display rows
 * @param summaryIdx - Row index to bold as a summary row, if any
 */
export function printMarkdownTable(
  headers: string[],
  rows: Row[],
  summaryIdx = -1,
): void {
  console.log(mdRow(headers));
  console.log(mdRow(headers.map((_, i) => (i === 0 ? ":--" : "--:"))));

  for (const [i, row] of rows.entries()) {
    console.log(mdRow(i === summaryIdx ? row.map((c) => `**${c}**`) : row));
  }

  console.log();
}

/**
 * Format a markdown table row.
 * @param cells - Cell values
 * @returns Pipe-delimited markdown row
 */
export function mdRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/**
 * Format a number with comma separators.
 * @param n - Number to format
 * @returns Formatted string
 */
export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Format a ratio to 1 decimal place, guarding division by zero.
 * @param numerator - Top of the ratio
 * @param denominator - Bottom of the ratio
 * @returns Formatted ratio, or an en dash when undefined
 */
export function ratio(numerator: number, denominator: number): string {
  return denominator > 0 ? (numerator / denominator).toFixed(1) : "–";
}

/**
 * Format a percentage to 1 decimal place.
 * @param value - Percentage
 * @returns Formatted percentage
 */
export function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format a duration in milliseconds as seconds.
 * @param ms - Milliseconds
 * @returns Formatted duration
 */
export function duration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
