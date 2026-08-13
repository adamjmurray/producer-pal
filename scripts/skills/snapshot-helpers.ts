// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Argument parsing and corpus comparison for snapshot-skills.ts, split out so
// both are unit-testable — the script's destructive step (it removes the output
// directory before writing) means a misread argument deletes the wrong thing.

import path from "node:path";

/** The output directory, and the corpus to compare it against. */
export interface SnapshotArgs {
  outDir: string;
  diffDir: string | null;
}

/** How one file differs between two corpora. */
export interface CorpusChange {
  kind: "added" | "removed" | "changed";
  file: string;
  /** Character counts, on a change. */
  was?: number;
  now?: number;
}

/** The marker the generated README opens with, used to recognize a corpus. */
export const CORPUS_MARKER = "# Skills snapshots";

const FLAGS = new Set(["--out", "--diff"]);

/**
 * Parse `--out DIR` / `--diff DIR`. Strict on purpose: an unrecognized argument
 * throws rather than falling back to the default output directory, because that
 * default gets ERASED before writing — a typo'd `--out=/tmp/x` would otherwise
 * silently delete the baseline the user was trying to keep.
 *
 * @param argv - Arguments after the script name
 * @param defaultDir - Where to write when `--out` is absent
 * @returns The resolved output and comparison directories
 * @throws When an argument is unknown, malformed, or missing its value
 */
export function parseArgs(
  argv: readonly string[],
  defaultDir: string,
): SnapshotArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;

    if (!FLAGS.has(arg)) {
      throw new Error(
        `unknown argument "${arg}" (expected --out DIR or --diff DIR; note the value is a separate argument, not --out=DIR)`,
      );
    }

    const value = argv[++index];

    if (value == null || value.startsWith("--")) {
      throw new Error(`${arg} needs a directory`);
    }

    // Resolved against the invocation directory, which is what a user typing a
    // relative path means.
    values.set(arg, path.resolve(value));
  }

  const outDir = values.get("--out") ?? defaultDir;
  const diffDir = values.get("--diff") ?? null;

  if (diffDir != null && diffDir === outDir) {
    throw new Error(
      `--diff ${diffDir} is the directory being written; the comparison would erase it and then report no change. Pass a different --out, or diff against a copy.`,
    );
  }

  return { outDir, diffDir };
}

/**
 * Compare two corpora by CONTENT, not size. An edit that keeps a blob's length
 * (a renamed heading, a reordered list) is exactly the kind a fragment re-carve
 * produces, and a size-only comparison would call it "no change".
 *
 * @param before - Previous corpus, relative path → contents
 * @param after - Corpus just written, relative path → contents
 * @returns Every difference, added/changed first, then removed
 */
export function compareCorpora(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): CorpusChange[] {
  const changes: CorpusChange[] = [];

  for (const [file, content] of after) {
    const was = before.get(file);

    if (was == null) changes.push({ kind: "added", file, now: content.length });
    else if (was !== content) {
      changes.push({
        kind: "changed",
        file,
        was: was.length,
        now: content.length,
      });
    }
  }

  for (const file of before.keys()) {
    if (!after.has(file)) changes.push({ kind: "removed", file });
  }

  return changes;
}

/**
 * Render the comparison for the terminal.
 *
 * @param changes - The differences ({@link compareCorpora})
 * @returns One line per change, or a single "nothing changed" line
 */
export function formatChanges(changes: readonly CorpusChange[]): string {
  if (changes.length === 0) return "No blob changed.";

  return changes.map(formatChange).join("\n");
}

// --- Helpers below main export ---

/**
 * Render one change. A changed blob shows its size delta, and says so explicitly
 * when the content moved without the length moving.
 *
 * @param change - The difference to render
 * @returns The display line
 */
function formatChange(change: CorpusChange): string {
  if (change.kind === "added") return `  + ${change.file} (${change.now})`;
  if (change.kind === "removed") return `  - ${change.file}`;

  const delta = (change.now ?? 0) - (change.was ?? 0);

  if (delta === 0) return `  ~ ${change.file} (same size, different text)`;

  return `  ~ ${change.file} ${change.was} → ${change.now} (${delta > 0 ? "+" : ""}${delta})`;
}
