// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
