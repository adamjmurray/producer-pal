#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Writes the skills snapshot corpus — the assembled blob for every (toolset
// profile x depth x notation) — and compares two of them. Output is gitignored:
// it's a scratch artifact for iterating on the fragment carve, not a committed
// baseline.
//
//   npm run skills:snapshot                 write dev/skills-snapshots, print the report
//   npm run skills:snapshot -- --out DIR    write somewhere else (keep a "before")
//   npm run skills:snapshot -- --diff DIR   write, then show what changed vs DIR

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpus, type SnapshotFile } from "./skills-corpus.ts";
import {
  compareCorpora,
  CORPUS_MARKER,
  formatChanges,
  parseArgs,
} from "./snapshot-helpers.ts";

const PROJECT_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_DIR = path.join(PROJECT_ROOT, "dev/skills-snapshots");

await main();

/**
 * Generate the corpus, print the report, and diff against a previous run when
 * `--diff` names one.
 */
async function main(): Promise<void> {
  const args = parseOrExit();
  const corpus = buildCorpus();

  await write(corpus, args.outDir);
  console.log(readmeOf(corpus));
  console.log(`Wrote ${corpus.length} files to ${label(args.outDir)}/\n`);

  if (args.diffDir != null) await diff(args.diffDir, args.outDir);
}

// --- Helpers below main export ---

/**
 * Parse the command line, reporting a usage error rather than a stack trace.
 *
 * @returns The parsed arguments
 */
function parseOrExit(): ReturnType<typeof parseArgs> {
  try {
    return parseArgs(process.argv.slice(2), DEFAULT_DIR);
  } catch (error: unknown) {
    console.error(`skills:snapshot: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Name a directory for display: repo-relative when it's inside the repo, else
 * absolute (a `--out /tmp/...` shouldn't print as a pile of `../`).
 *
 * @param dir - Absolute directory path
 * @returns The path to show
 */
function label(dir: string): string {
  const relative = path.relative(PROJECT_ROOT, dir);

  return relative.startsWith("..") ? dir : relative || ".";
}

/**
 * The README's text, which doubles as the terminal report.
 *
 * @param corpus - The generated files
 * @returns The report markdown
 */
function readmeOf(corpus: SnapshotFile[]): string {
  return corpus.find((file) => file.path === "README.md")?.content ?? "";
}

/**
 * Write the corpus, replacing whatever is there. The directory is removed first
 * so a profile or notation that no longer exists doesn't leave a stale file
 * behind looking current — which is why {@link assertSafeTarget} runs before it.
 *
 * @param corpus - The files to write
 * @param outDir - Absolute path to write them under
 */
async function write(corpus: SnapshotFile[], outDir: string): Promise<void> {
  await assertSafeTarget(outDir);
  await fs.rm(outDir, { recursive: true, force: true });

  for (const file of corpus) {
    const target = path.join(outDir, file.path);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf-8");
  }
}

/**
 * Refuse to erase a directory that isn't ours. `--out` takes an arbitrary path
 * and the write is a recursive delete, so `--out ~/Documents` has to be a usage
 * error rather than a data loss. Absent or empty is fine; anything else must
 * carry a corpus README.
 *
 * @param outDir - The directory about to be removed and rewritten
 */
async function assertSafeTarget(outDir: string): Promise<void> {
  const entries = await readDirNames(outDir);

  if (entries == null || entries.length === 0) return;

  const readme = await readFileOrNull(path.join(outDir, "README.md"));

  if (readme?.startsWith(CORPUS_MARKER)) return;

  console.error(
    `skills:snapshot: refusing to erase ${outDir} — it is not empty and holds no snapshot corpus. Pick an empty or nonexistent directory.`,
  );
  process.exit(1);
}

/**
 * Compare a previous run against the one just written: a content-level summary
 * first, then the line-level diff from `diff -ru`, which prints exactly what a
 * reviewer wants to read.
 *
 * @param oldDir - The previous corpus
 * @param newDir - The corpus just written
 */
async function diff(oldDir: string, newDir: string): Promise<void> {
  if (!(await isDirectory(oldDir))) {
    console.error(`skills:snapshot: ${oldDir} is not a directory to compare.`);
    process.exit(1);
  }

  console.log(`# Changes vs ${label(oldDir)}\n`);
  console.log(
    formatChanges(
      compareCorpora(await readCorpus(oldDir), await readCorpus(newDir)),
    ),
  );

  printUnifiedDiff(oldDir, newDir);
}

/**
 * Print the line-level diff, or say why there isn't one. Silence here would read
 * as "nothing changed" right after a summary that said otherwise, so a missing
 * `diff` binary or a truncated pipe has to announce itself.
 *
 * @param oldDir - The previous corpus
 * @param newDir - The corpus just written
 */
function printUnifiedDiff(oldDir: string, newDir: string): void {
  const result = spawnSync("diff", ["-ru", oldDir, newDir], {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.stdout) console.log(`\n${result.stdout}`);

  if (result.error != null) {
    console.error(
      `\nskills:snapshot: could not run \`diff\` (${result.error.message}). The summary above still holds; compare the directories yourself for line-level detail.`,
    );
  }
}

/**
 * Read every blob in a corpus directory. README.md is excluded — it only
 * restates the numbers, so a change there is never news.
 *
 * @param dir - Corpus directory
 * @returns Relative path → contents
 */
async function readCorpus(dir: string): Promise<Map<string, string>> {
  const entries = await fs.readdir(dir, {
    recursive: true,
    withFileTypes: true,
  });
  const found = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const full = path.join(entry.parentPath, entry.name);
    const relative = path.relative(dir, full);

    if (relative === "README.md") continue;

    found.set(relative, await fs.readFile(full, "utf-8"));
  }

  return found;
}

/**
 * List a directory's entries, treating absence as a value.
 *
 * @param dir - Absolute directory path
 * @returns Entry names, or null when the path doesn't exist or isn't a directory
 */
async function readDirNames(dir: string): Promise<string[] | null> {
  try {
    return await fs.readdir(dir);
  } catch {
    return null;
  }
}

/**
 * Read a file, treating absence as a value.
 *
 * @param target - Absolute path
 * @returns The contents, or null when it can't be read
 */
async function readFileOrNull(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Whether a path is an existing directory.
 *
 * @param target - Absolute path
 * @returns True only for a directory
 */
async function isDirectory(target: string): Promise<boolean> {
  try {
    const stats = await fs.stat(target);

    return stats.isDirectory();
  } catch {
    return false;
  }
}
