// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Renders the extra text blocks a tool result carried (what `ppal-connect`
 * injects) for a judge transcript. The model reads them, so the judge must too.
 */

/**
 * Longest block shown in full. The blocks scenarios grade on (remote script
 * line, up-to-date note, next step, memory index, global/project context) run
 * 30 to ~600 characters; this leaves room for a longer memory index. The Skills
 * (4 KB in small-model mode, ~60 KB otherwise) are over it and cost the judge
 * tokens for nothing, so they collapse to a placeholder.
 */
export const MAX_SHOWN_BLOCK_CHARS = 2000;

const TITLE_CHARS = 60;

/**
 * Transcript lines for a tool call's injected blocks.
 *
 * @param blocks - Block texts; hashes must already be resolved to text
 * @returns One indented entry per block, empty when there are none
 */
export function injectedBlockLines(blocks: string[] | undefined): string[] {
  return (blocks ?? []).map(renderBlock);
}

/**
 * Render one block: in full if short, else a one-line placeholder.
 *
 * @param text - The block text
 * @returns The transcript entry
 */
function renderBlock(text: string): string {
  if (text.length <= MAX_SHOWN_BLOCK_CHARS) {
    return `    + ${text.trim().replaceAll("\n", "\n      ")}`;
  }

  const title = text.trimStart().split("\n")[0] ?? "";
  const shown =
    title.length > TITLE_CHARS ? `${title.slice(0, TITLE_CHARS)}…` : title;

  return `    + [long block omitted: "${shown}" (${text.length} chars)]`;
}
