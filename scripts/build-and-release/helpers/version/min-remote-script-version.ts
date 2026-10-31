// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { execSync } from "node:child_process";
import { isGenUiScriptFile } from "#src/mcp-server/rpc/remote-script/bundle/gen-ui-remote-script-files.ts";
import { replaceVersionLine } from "./replace-version-line.ts";

/** The file that holds MIN_REMOTE_SCRIPT_VERSION, from the repo root. */
export const MIN_VERSION_FILE =
  "src/mcp-server/rpc/remote-script/port/remote-script-version.ts";

const MIN_VERSION_LINE = /^export const MIN_REMOTE_SCRIPT_VERSION = "(.*)";$/m;

/**
 * Drop the gen-UI files from a list of changed remote script files: no release
 * ships them, so changing one never needs a newer script.
 * @param changedFiles - Remote script files changed since the last release
 * @returns The ones a release ships
 */
export function shippedScriptChanges(changedFiles: string[]): string[] {
  return changedFiles.filter((file) => !isGenUiScriptFile(file));
}

/**
 * Find the shipped remote script files that changed since the nearest tag.
 * Throws when there is no tag (a clone without them).
 * @param rootDir - The repo root
 * @returns The nearest tag, and the changed files a release ships
 */
export function scriptChangesSinceLastTag(rootDir: string): {
  lastTag: string;
  changedFiles: string[];
} {
  const lastTag = execSync("git describe --tags --abbrev=0", {
    cwd: rootDir,
    encoding: "utf8",
  }).trim();
  const changed = execSync(
    `git diff --name-only ${lastTag} -- remote-script/Producer_Pal ":!remote-script/Producer_Pal/version.py"`,
    { cwd: rootDir, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  return { lastTag, changedFiles: shippedScriptChanges(changed) };
}

/**
 * Raise MIN_REMOTE_SCRIPT_VERSION to a new release when the remote script
 * changed since the last one. Any change counts, not just a route's: telling
 * the two apart by hand is how a release shipped needing a newer script than
 * its minimum, and an older script then ran with no prompt to update.
 * @param contents - The text of MIN_VERSION_FILE
 * @param newVersion - The version being bumped to
 * @param changedFiles - Remote script files changed since the last release,
 *   other than version.py
 * @returns The new text, or null when it stays as it is
 */
export function raiseMinRemoteScriptVersion(
  contents: string,
  newVersion: string,
  changedFiles: string[],
): string | null {
  if (
    changedFiles.length === 0 ||
    MIN_VERSION_LINE.exec(contents)?.[1] === newVersion
  ) {
    return null;
  }

  return replaceVersionLine(
    contents,
    MIN_VERSION_LINE,
    `export const MIN_REMOTE_SCRIPT_VERSION = "${newVersion}";`,
    MIN_VERSION_FILE,
  );
}

/**
 * Refuse a release build whose minimum is behind a changed remote script. The
 * bump only checks when it runs, so a script change after the bump goes
 * unnoticed until here.
 * @param contents - The text of MIN_VERSION_FILE
 * @param version - The version being built
 * @param lastTag - The nearest tag the changes are measured from
 * @param changedFiles - Shipped remote script files changed since that tag
 * @returns The error to print, or null when the build may go ahead
 */
export function staleMinRemoteScriptVersion(
  contents: string,
  version: string,
  lastTag: string,
  changedFiles: string[],
): string | null {
  const current = MIN_VERSION_LINE.exec(contents)?.[1];

  if (current == null) {
    throw new Error(`No MIN_REMOTE_SCRIPT_VERSION line in ${MIN_VERSION_FILE}`);
  }

  if (changedFiles.length === 0 || current === version) {
    return null;
  }

  return (
    `\n❌ The remote script changed since ${lastTag}, but MIN_REMOTE_SCRIPT_VERSION is "${current}", not "${version}".\n` +
    `   Changed: ${changedFiles.join(", ")}\n` +
    `   Set MIN_REMOTE_SCRIPT_VERSION to "${version}" in ${MIN_VERSION_FILE}, commit, and build again.\n`
  );
}
