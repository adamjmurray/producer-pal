// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Derived statistics printers for the LOC report.
 */

import { styleText } from "node:util";
import {
  type Styler,
  makeCliRow,
  makeCliSep,
  mdRow,
  printCliTitle,
} from "./loc-printers.ts";
import { type GroupStats, CODE_GROUPS } from "./loc.ts";

interface DerivedRow {
  tree: string;
  linesPerFunc: number;
  linesPerFile: number;
  commentPct: number;
  testSourceRatio: number | null;
}

/**
 * Compute derived stats for code trees from group stats.
 * @param groups - All group stats
 * @returns Derived stats per code tree plus an overall row
 */
function computeDerivedStats(groups: GroupStats[]): DerivedRow[] {
  const codeGroups = groups.filter((g) => CODE_GROUPS.has(g.group as never));
  const trees = [...new Set(codeGroups.map((g) => g.group))];

  const rows: DerivedRow[] = trees.map((tree) => {
    const src = codeGroups.find(
      (g) => g.group === tree && g.category === "source",
    );
    const test = codeGroups.find(
      (g) => g.group === tree && g.category === "test",
    );
    const srcCode = src?.code ?? 0;
    const srcFuncs = src?.functions ?? 0;
    const srcFiles = src?.files ?? 0;
    const srcComment = src?.comment ?? 0;
    const testCode = test?.code ?? 0;

    return {
      tree,
      linesPerFunc: srcFuncs > 0 ? srcCode / srcFuncs : 0,
      linesPerFile: srcFiles > 0 ? srcCode / srcFiles : 0,
      commentPct:
        srcCode + srcComment > 0
          ? (srcComment / (srcComment + srcCode)) * 100
          : 0,
      testSourceRatio: srcCode > 0 ? testCode / srcCode : null,
    };
  });

  // Overall row
  const allSrc = codeGroups.filter((g) => g.category === "source");
  const allTest = codeGroups.filter((g) => g.category === "test");
  const totalSrcCode = allSrc.reduce((s, g) => s + g.code, 0);
  const totalSrcFuncs = allSrc.reduce((s, g) => s + g.functions, 0);
  const totalSrcFiles = allSrc.reduce((s, g) => s + g.files, 0);
  const totalSrcComment = allSrc.reduce((s, g) => s + g.comment, 0);
  const totalTestCode = allTest.reduce((s, g) => s + g.code, 0);

  rows.push({
    tree: "Overall",
    linesPerFunc: totalSrcFuncs > 0 ? totalSrcCode / totalSrcFuncs : 0,
    linesPerFile: totalSrcFiles > 0 ? totalSrcCode / totalSrcFiles : 0,
    commentPct:
      totalSrcCode + totalSrcComment > 0
        ? (totalSrcComment / (totalSrcComment + totalSrcCode)) * 100
        : 0,
    testSourceRatio: totalSrcCode > 0 ? totalTestCode / totalSrcCode : null,
  });

  return rows;
}

/**
 * Format a row's values as strings.
 * @param r - Derived row
 * @returns Array of formatted values
 */
function fmtRow(r: DerivedRow): string[] {
  /**
   * Format to 1 decimal place.
   * @param n - Number to format
   * @returns Formatted string
   */
  const d = (n: number): string => n.toFixed(1);

  return [
    r.tree,
    d(r.linesPerFunc),
    d(r.linesPerFile),
    `${d(r.commentPct)}%`,
    r.testSourceRatio != null ? `${d(r.testSourceRatio)}x` : "–",
  ];
}

/**
 * Print CLI-formatted derived stats table.
 * @param groups - All group stats
 */
export function printCliDerivedStats(groups: GroupStats[]): void {
  const rows = computeDerivedStats(groups);

  const widths = [
    Math.max("Tree".length, ...rows.map((r) => r.tree.length)),
    Math.max("Lines/Func".length, 6),
    Math.max("Lines/File".length, 6),
    Math.max("Comment%".length, 6),
    Math.max("Test:Source".length, 6),
  ];

  const row = makeCliRow(widths);
  const sep = makeCliSep(widths);

  printCliTitle("Derived Stats (source only)");
  console.log(
    row(["Tree", "Lines/Func", "Lines/File", "Comment%", "Test:Source"]),
  );
  console.log(sep);

  const lastIdx = rows.length - 1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as DerivedRow;
    const isOverall = i === lastIdx;
    const color: Styler = isOverall
      ? (s) => styleText(["yellow", "bold"], s)
      : (s) => styleText("green", s);

    if (isOverall) console.log(sep);

    console.log(row(fmtRow(r), color));
  }
}

/**
 * Print markdown-formatted derived stats table.
 * @param groups - All group stats
 */
export function printMarkdownDerivedStats(groups: GroupStats[]): void {
  const rows = computeDerivedStats(groups);

  console.log("\n## Derived Stats (source only)\n");
  console.log(
    mdRow("Tree", "Lines/Func", "Lines/File", "Comment%", "Test:Source"),
  );
  console.log("| :-- | --: | --: | --: | --: |");

  const lastIdx = rows.length - 1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as DerivedRow;
    const isOverall = i === lastIdx;
    const vals = fmtRow(r);
    const wrapped = isOverall ? vals.map((s) => `**${s}**`) : vals;

    console.log(mdRow(...wrapped));
  }

  console.log();
}
