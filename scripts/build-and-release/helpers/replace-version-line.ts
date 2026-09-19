// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Replace a version line in a file's text, refusing a no-op. A bump that
 * silently matches nothing — a renamed constant, a reformatted line — would
 * still print "Updated" and ship a file stuck on the old version.
 *
 * @param contents - The file's current text
 * @param pattern - Matches the whole version line
 * @param line - The line to write instead
 * @param file - Path shown in the error
 * @returns The new text
 * @throws If the pattern matched nothing, or matched what is already there
 */
export function replaceVersionLine(
  contents: string,
  pattern: RegExp,
  line: string,
  file: string,
): string {
  const updated = contents.replace(pattern, line);

  if (updated === contents) {
    throw new Error(
      `No version line to update in ${file}: expected a line matching ${String(pattern)}`,
    );
  }

  return updated;
}
