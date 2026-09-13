// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Measures comments in the non-test TypeScript sources. Shared by
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

/** One run of consecutive comment lines. */
export interface CommentBlock {
  /** 1-based line the run starts on. */
  line: number;
  lines: number;
}

/** Comment and code line counts for one source. */
export interface CommentCounts {
  commentLines: number;
  codeLines: number;
  /** Lines in the longest run of consecutive comment lines. */
  longestBlock: number;
  /** 1-based line the longest block starts on, or 0 when there is none. */
  longestBlockLine: number;
  /** Blocks longer than the scan's `maxBlockLines`, in file order. */
  blocks: CommentBlock[];
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
 * @param maxBlockLines - Report blocks longer than this; none by default
 * @returns Comment and code counts, the longest block, and the long blocks
 */
export function scanComments(
  source: string,
  fileName = "source.ts",
  maxBlockLines = Number.POSITIVE_INFINITY,
): CommentCounts {
  const lines = source.split("\n");
  const kinds = classifyLines(source, lines, fileName);
  const blocks = commentBlocks(kinds);
  const longest = blocks.reduce(
    (best, block) => (block.lines > best.lines ? block : best),
    { line: 0, lines: 0 },
  );

  return {
    commentLines: kinds.filter((kind) => kind === "comment").length,
    codeLines: kinds.filter((kind) => kind === "code").length,
    longestBlock: longest.lines,
    longestBlockLine: longest.line,
    blocks: blocks.filter((block) => block.lines > maxBlockLines),
  };
}

/**
 * Scan one file from disk
 * @param filePath - Absolute path to a .ts or .tsx file
 * @param maxBlockLines - Report blocks longer than this; none by default
 * @returns Counts plus the file's repo-relative path
 */
export function scanCommentFile(
  filePath: string,
  maxBlockLines?: number,
): FileCommentStats {
  const source = fs.readFileSync(filePath, "utf8");

  return {
    file: path.relative(projectRoot, filePath),
    ...scanComments(source, filePath, maxBlockLines),
  };
}

/**
 * Scan every non-test TypeScript source in a tree
 * @param tree - Tree name, resolved against the project root
 * @param maxBlockLines - Report blocks longer than this; none by default
 * @returns One entry per file, in directory order
 */
export function scanCommentTree(
  tree: CommentTree,
  maxBlockLines?: number,
): FileCommentStats[] {
  return findSourceFiles(path.join(projectRoot, tree), true)
    .filter((file) => TS_EXTENSIONS.has(path.extname(file)))
    .map((file) => scanCommentFile(file, maxBlockLines));
}

/** Aggregate counts for a set of files. */
export interface CommentSummary {
  files: number;
  commentLines: number;
  codeLines: number;
  /** The longest block any one of the files holds. */
  longestBlock: number;
}

/**
 * Total a tree's per-file counts
 * @param stats - Per-file counts
 * @returns Summed counts and the longest block in the set
 */
export function summarizeComments(stats: FileCommentStats[]): CommentSummary {
  const summary: CommentSummary = {
    files: stats.length,
    commentLines: 0,
    codeLines: 0,
    longestBlock: 0,
  };

  for (const entry of stats) {
    summary.commentLines += entry.commentLines;
    summary.codeLines += entry.codeLines;
    summary.longestBlock = Math.max(summary.longestBlock, entry.longestBlock);
  }

  return summary;
}

/**
 * Comment lines per code line, rounded to 3 decimals
 * @param counts - Any comment and code line counts
 * @returns The density, or 0 when there is no code
 */
export function commentDensity(counts: {
  commentLines: number;
  codeLines: number;
}): number {
  if (counts.codeLines === 0) {
    return 0;
  }

  return Number((counts.commentLines / counts.codeLines).toFixed(3));
}

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Find every run of consecutive comment lines
 * @param kinds - One kind per line
 * @returns One entry per run, in file order
 */
function commentBlocks(kinds: LineKind[]): CommentBlock[] {
  const blocks: CommentBlock[] = [];
  let run = 0;

  // The appended line is a sentinel: it closes a run that ends the file.
  for (const [i, kind] of [...kinds, "blank" as LineKind].entries()) {
    if (kind === "comment") {
      run++;
      continue;
    }

    if (run > 0) {
      blocks.push({ line: i - run + 1, lines: run });
    }

    run = 0;
  }

  return blocks;
}

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
