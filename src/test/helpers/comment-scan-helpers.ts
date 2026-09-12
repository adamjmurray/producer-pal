// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Measures comment volume in the non-test TypeScript sources. Shared by
// `npm run comment:stats` and src/test/comment-limits.test.ts so both report the
// same numbers.
//
// Comment ranges come from the TypeScript parser, not a regex, so a "//" inside
// a string, a template, or JSX text is never counted as a comment.
//
// Two kinds of comment don't count: the license header every file opens with,
// and lint directives, which are machine instructions rather than prose.
//
// Only .ts/.tsx are scanned. The .js under src/ is generated (peggy parsers, the
// portal build) and gitignored, so counting it would make the totals depend on
// whether someone had built.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { findSourceFiles, projectRoot } from "./meta-test-helpers.ts";

/** Trees the comment budget covers, non-test sources only. */
export const COMMENT_TREES = [
  "src",
  "scripts",
  "webui",
  "evals",
  "e2e",
] as const;

export type CommentTree = (typeof COMMENT_TREES)[number];

/** A comment block this long or longer counts as a long block. */
export const LONG_BLOCK_LINES = 8;

/** Comment and code line counts for one source. */
export interface CommentCounts {
  commentLines: number;
  codeLines: number;
  /** Lines in the longest run of consecutive comment lines. */
  longestBlock: number;
  /** 1-based line the longest block starts on, or 0 when there is none. */
  longestBlockLine: number;
}

/** Counts for one file, with its repo-relative path. */
export interface FileCommentStats extends CommentCounts {
  file: string;
}

/** How a line is counted. Directive and license lines count as neither. */
type LineKind = "blank" | "code" | "comment" | "skipped";

const DIRECTIVE =
  /(?:es|ox)lint-(?:disable|enable)|v8 ignore|istanbul ignore|@ts-(?:expect-error|ignore|nocheck)|prettier-ignore|@vitest-environment/;

/**
 * Count comment and code lines in a TypeScript source
 * @param source - File contents
 * @param fileName - Name used to pick the parser dialect (.tsx parses as TSX)
 * @returns Comment, code, and longest-block counts
 */
export function scanComments(
  source: string,
  fileName = "source.ts",
): CommentCounts {
  const lines = source.split("\n");
  const kinds = classifyLines(source, lines, fileName);
  let commentLines = 0;
  let codeLines = 0;
  let longestBlock = 0;
  let longestBlockLine = 0;
  let run = 0;

  for (const [i, kind] of kinds.entries()) {
    if (kind === "code") {
      codeLines++;
    }

    if (kind === "comment") {
      commentLines++;
      run++;

      if (run > longestBlock) {
        longestBlock = run;
        longestBlockLine = i + 2 - run;
      }
    } else {
      run = 0;
    }
  }

  return { commentLines, codeLines, longestBlock, longestBlockLine };
}

/**
 * Scan one file from disk
 * @param filePath - Absolute path to a .ts or .tsx file
 * @returns Counts plus the file's repo-relative path
 */
export function scanCommentFile(filePath: string): FileCommentStats {
  const source = fs.readFileSync(filePath, "utf8");

  return {
    file: path.relative(projectRoot, filePath),
    ...scanComments(source, filePath),
  };
}

/**
 * Scan every non-test TypeScript source in a tree
 * @param tree - Tree name, resolved against the project root
 * @returns One entry per file, in directory order
 */
export function scanCommentTree(tree: CommentTree): FileCommentStats[] {
  return findSourceFiles(path.join(projectRoot, tree), true)
    .filter((file) => TS_EXTENSIONS.has(path.extname(file)))
    .map(scanCommentFile);
}

/** Aggregate counts for a set of files. */
export interface CommentSummary extends CommentCounts {
  files: number;
  /** Files whose longest block reaches LONG_BLOCK_LINES. */
  longBlockFiles: number;
  /** Repo-relative path of the file holding the longest block. */
  longestBlockFile: string;
}

/**
 * Total a tree's per-file counts
 * @param stats - Per-file counts
 * @returns Summed counts, plus where the longest block lives
 */
export function summarizeComments(stats: FileCommentStats[]): CommentSummary {
  const summary: CommentSummary = {
    files: stats.length,
    commentLines: 0,
    codeLines: 0,
    longestBlock: 0,
    longestBlockLine: 0,
    longBlockFiles: 0,
    longestBlockFile: "",
  };

  for (const entry of stats) {
    summary.commentLines += entry.commentLines;
    summary.codeLines += entry.codeLines;

    if (entry.longestBlock >= LONG_BLOCK_LINES) {
      summary.longBlockFiles++;
    }

    if (entry.longestBlock > summary.longestBlock) {
      summary.longestBlock = entry.longestBlock;
      summary.longestBlockLine = entry.longestBlockLine;
      summary.longestBlockFile = entry.file;
    }
  }

  return summary;
}

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Classify every line as blank, code, comment, or skipped
 * @param source - File contents
 * @param lines - The same contents already split on newlines
 * @param fileName - Name used to pick the parser dialect
 * @returns One kind per line
 */
function classifyLines(
  source: string,
  lines: string[],
  fileName: string,
): LineKind[] {
  const mask = commentMask(source, fileName);
  const kinds: LineKind[] = [];
  let offset = 0;

  for (const line of lines) {
    kinds.push(classifyLine(line, mask, offset));
    offset += line.length + 1;
  }

  skipLicenseHeader(lines, kinds);

  return kinds;
}

/**
 * Classify one line against the comment mask
 * @param line - The line's text
 * @param mask - Per-character comment flags for the whole file
 * @param offset - Character offset where the line starts
 * @returns The line's kind
 */
function classifyLine(
  line: string,
  mask: Uint8Array,
  offset: number,
): LineKind {
  let hasComment = false;

  for (let i = 0; i < line.length; i++) {
    if ((line[i] as string).trim() === "") {
      continue;
    }

    if (mask[offset + i] === 1) {
      hasComment = true;
    } else {
      return "code";
    }
  }

  if (!hasComment) {
    return "blank";
  }

  return DIRECTIVE.test(line) ? "skipped" : "comment";
}

/**
 * Mark the shebang and the license header at the top of the file as skipped
 * @param lines - The file's lines
 * @param kinds - Line kinds, modified in place
 */
function skipLicenseHeader(lines: string[], kinds: LineKind[]): void {
  // A shebang is neither code nor comment, and the license header sits under it.
  if (lines[0]?.startsWith("#!")) {
    kinds[0] = "skipped";
  }

  let start = 0;

  while (kinds[start] === "blank" || kinds[start] === "skipped") {
    start++;
  }

  let end = start;

  while (kinds[end] === "comment") {
    end++;
  }

  const header = lines.slice(start, end).join("\n");

  if (!header.includes("SPDX-License-Identifier")) {
    return;
  }

  kinds.fill("skipped", start, end);
}

/**
 * Flag every character that belongs to a comment
 * @param source - File contents
 * @param fileName - Name used to pick the parser dialect
 * @returns One byte per character, 1 inside a comment
 */
function commentMask(source: string, fileName: string): Uint8Array {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const mask = new Uint8Array(source.length);

  /**
   * Mark a token's leading comments, then walk its children
   * @param node - Current AST node
   */
  const visit = (node: ts.Node): void => {
    // Every comment is leading trivia of exactly one token — including a
    // trailing "// note" after code, which leads the NEXT token, and the
    // file-ending comment, which leads the end-of-file token.
    for (const range of ts.getLeadingCommentRanges(
      source,
      node.getFullStart(),
    ) ?? []) {
      mask.fill(1, range.pos, range.end);
    }

    for (const child of node.getChildren(sourceFile)) {
      visit(child);
    }
  };

  visit(sourceFile);

  return mask;
}
