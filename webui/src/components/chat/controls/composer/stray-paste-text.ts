// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** A lone link, as a browser's Copy Image leaves on the clipboard. */
const URL_PATTERN = /^(?:https?|file|data|blob):\S+$/i;

/**
 * Whether the text riding along with pasted image files is just their label,
 * not content: Finder adds each file's name, Firefox's Copy Image adds the
 * image's URL. Pasting it beside the attached image would be clutter.
 * @param text - The clipboard's `text/plain`
 * @param files - The pasted image files
 * @param htmlHasText - Whether the clipboard's HTML holds real text, which
 *   makes a lone link a deliberate part of the copy
 * @returns True if the text should be dropped
 */
export function isStrayPasteText(
  text: string,
  files: File[],
  htmlHasText: boolean,
): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (lines.length === 0) {
    return false;
  }

  const names = new Set(files.map((file) => file.name));

  return lines.every(
    (line) => names.has(line) || (!htmlHasText && URL_PATTERN.test(line)),
  );
}
