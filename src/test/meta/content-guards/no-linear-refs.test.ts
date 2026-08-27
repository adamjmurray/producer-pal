// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Checking commit messages means reading git history, and git is a separate
// process. The src/ shell-out ban exists so shipped code can't launch
// processes; this is meta-test infrastructure that never ships.
// eslint-disable-next-line no-restricted-imports -- meta test, never shipped
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  countPatternOccurrences,
  findRepoTextFiles,
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// This repo is public; Linear ticket numbers are private. Ticket references
// (the "AJM-" prefix followed by digits) must not leak into any tracked file —
// comments, docs, test names, or prose. The rule text elsewhere uses the
// placeholder "AJM-NNN" (letters), which this digit-based pattern won't match.
const LINEAR_REF = /AJM-\d+/;

// Commit messages need the same guard: `main` takes PRs by squash merge with
// squash_merge_commit_message=COMMIT_MESSAGES, so every commit body on a branch
// is concatenated verbatim into the permanent public history.
//
// Refs the guard can't undo. Rewriting a commit already published on origin
// means force-pushing shared history — a worse trade than leaving one stale
// reference. Scrub these from the squash body at merge time (dev/Releasing.md
// Step 5) rather than growing this list; new commits must not need an entry.
const GRANDFATHERED_COMMITS = new Set([
  // Body of "feat(mcp): per-request smallModelMode via header", which points at
  // the follow-up ticket for per-worker mode. Already on public origin/dev.
  "66454adf126f4ba60f479c85c3c2a601961a0844",
]);

// Everything not yet in `main` — the exact set of messages a squash merge will
// paste into public history.
const BASE_REF_CANDIDATES = ["origin/main", "main"];

describe("no Linear ticket references", () => {
  it("should not contain any AJM-<number> references in tracked files", () => {
    const files = findRepoTextFiles();
    const matches = countPatternOccurrences(files, LINEAR_REF);

    throwOnFileViolations(
      matches.map((m) => ({ file: `${m.file}:${m.line}`, reason: m.match })),
      "Found Linear ticket reference(s) in the public repo",
      "Linear is private — remove the ticket number. Describe the reasoning " +
        "directly in the comment instead of pointing at a ticket.",
    );

    expect(matches).toHaveLength(0);
  });

  it("should not contain any AJM-<number> references in commit messages", () => {
    const violations = findLinearRefsInCommits();

    throwOnFileViolations(
      violations,
      "Found Linear ticket reference(s) in commit message(s)",
      "Linear is private and squash merges copy commit bodies into public " +
        "history. Reword with `git commit --amend` (tip) or `git rebase -i` " +
        "(older), and describe the reasoning directly instead of pointing at " +
        "a ticket.",
    );

    expect(violations).toHaveLength(0);
  });
});

/**
 * Scan the commit messages this branch would add to `main` for ticket refs.
 * Returns nothing when no base ref resolves — a shallow CI checkout or a fresh
 * fork has no `main` to diff against, so the check is a local pre-push guard.
 * @returns One violation per offending commit, empty when clean or unresolvable
 */
function findLinearRefsInCommits(): { file: string; reason: string }[] {
  const baseRef = BASE_REF_CANDIDATES.find(refExists);

  if (baseRef == null) return [];

  // %x1f separates sha from message, %x1e separates commits — neither can
  // appear in a commit message, unlike any printable delimiter.
  const log = git(["log", `${baseRef}..HEAD`, "--format=%H%x1f%B%x1e"]);

  return log
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = "", message = ""] = record.split("\x1f");

      return { sha, message };
    })
    .filter(({ sha }) => !GRANDFATHERED_COMMITS.has(sha))
    .flatMap(({ sha, message }) => {
      const [subject = "", ...bodyLines] = message.split("\n");
      const offending = [subject, ...bodyLines].filter((line) =>
        LINEAR_REF.test(line),
      );

      return offending.map((line) => ({
        file: `${sha.slice(0, 9)} ${subject}`,
        reason: line.trim(),
      }));
    });
}

/**
 * Check whether a ref resolves to a commit in this clone
 * @param ref - Ref name to resolve
 * @returns True when the ref exists locally
 */
function refExists(ref: string): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);

    return true;
  } catch {
    return false;
  }
}

/**
 * Run a git command in the project root
 * @param args - Arguments passed to git
 * @returns The command's stdout
 */
function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
}
