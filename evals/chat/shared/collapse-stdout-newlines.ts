// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Global stdout interceptor that collapses runs of 3+ consecutive
 * newlines down to 2 (preserving single empty lines). This cleans up
 * excessive blank lines emitted by LLMs (especially in thinking blocks).
 */

/** Result of collapsing consecutive newlines in a text chunk */
export interface CollapseResult {
  text: string;
  trailingNewlines: number;
}

/**
 * Collapse runs of 3+ consecutive newlines to exactly 2, preserving
 * single empty lines. Handles streaming by accepting the trailing
 * newline count from prior output.
 *
 * @param text - Text chunk to process
 * @param trailingNewlines - Consecutive newlines already written
 * @returns Collapsed text and updated trailing newline count
 */
export function collapseNewlines(
  text: string,
  trailingNewlines: number,
): CollapseResult {
  let result = "";
  let trailing = trailingNewlines;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      trailing++;
      if (trailing <= 2) result += "\n";
    } else {
      trailing = 0;
      result += text[i];
    }
  }

  return { text: result, trailingNewlines: trailing };
}

/**
 * Install a global stdout interceptor that collapses consecutive empty lines.
 * Patches process.stdout.write so all output (including console.log) is filtered.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function collapseStdoutNewlines(): void {
  // Guard against double-patching
  const stdout = process.stdout as NodeJS.WriteStream & {
    _collapsePatched?: boolean;
  };

  if (stdout._collapsePatched) return;
  stdout._collapsePatched = true;

  const originalWrite = stdout.write.bind(stdout);
  let trailingNewlines = 0;

  stdout.write = (chunk: Uint8Array | string, ...args: unknown[]): boolean => {
    const text = typeof chunk === "string" ? chunk : chunk.toString();
    const collapsed = collapseNewlines(text, trailingNewlines);

    trailingNewlines = collapsed.trailingNewlines;

    if (!collapsed.text) return true;

    return originalWrite(collapsed.text, ...(args as []));
  };
}
