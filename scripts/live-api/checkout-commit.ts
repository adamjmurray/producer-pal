// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "../..");

/** Runs git with these args in the repo and returns its trimmed stdout. */
export type RunGit = (args: string[]) => string;

/**
 * The checkout's short commit, as builds record it, with `-dirty` when the
 * given folder has uncommitted changes: a dev install copies the working tree,
 * not the commit.
 *
 * @param folder - Repo-relative folder whose changes count
 * @param runGit - Runs git; replaced in tests
 * @returns The commit, or "" when git can't tell
 */
export function checkoutCommit(
  folder: string,
  runGit: RunGit = runRepoGit,
): string {
  try {
    const sha = runGit(["rev-parse", "--short=7", "HEAD"]);
    // No index lock, so it never blocks a commit running in the same checkout.
    const changes = runGit([
      "--no-optional-locks",
      "status",
      "--porcelain",
      "--",
      folder,
    ]);

    return changes === "" ? sha : `${sha}-dirty`;
  } catch {
    return "";
  }
}

/**
 * Run git in the repo root.
 *
 * @param args - git arguments
 * @returns Trimmed stdout
 */
function runRepoGit(args: string[]): string {
  return execFileSync("git", ["-C", REPO_ROOT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}
