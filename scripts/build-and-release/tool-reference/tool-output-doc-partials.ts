// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The "Example output" block the docs site embeds under each tool's schema.
// Split out from the generator script so it can be tested without running the
// tools or the script's file I/O.

import { type ExampleRun } from "./example-live-set/runner.ts";

/** Over this many lines, an appended block is stubbed out rather than shown. */
const LONG_BLOCK_LINES = 20;

/** How much of a stubbed block is shown — enough to tell which one it is. */
const LONG_BLOCK_PREVIEW = 3;

/**
 * Render one example call and its result as a collapsible markdown block.
 * @param run - The example call, its output, and any warnings it emitted
 * @returns Markdown with a details/summary block
 */
export function generateOutputPartial(run: ExampleRun): string {
  const { example } = run;
  const lines = [
    "<details>",
    "<summary>Example output</summary>",
    "",
    `Called with \`${JSON.stringify(example.args)}\`:`,
    "",
  ];

  if (run.error != null) {
    lines.push(
      `::: warning The example call failed`,
      "",
      "```",
      run.error,
      "```",
      "",
      ":::",
      "",
    );
  } else {
    lines.push("```json", JSON.stringify(run.output, null, 2), "```", "");
  }

  for (const warning of run.warnings) {
    lines.push(`_Warning appended to the result: ${warning}_`, "");
  }

  if (run.appended != null && run.appended.length > 0) {
    lines.push(...appendedBlockLines(run.appended));
  }

  if (example.caption != null) {
    lines.push(example.caption, "");
  }

  lines.push("</details>", "");

  return lines.join("\n");
}

/**
 * Render the text blocks the Node side appends after the JSON result. The
 * skills blob is a whole document, so a long block is stubbed to its first
 * lines rather than reprinted here.
 * @param blocks - Each appended block's text, in the order a client sees it
 * @returns Markdown lines
 */
function appendedBlockLines(blocks: string[]): string[] {
  const lines = [
    "The response carries these as separate text blocks after the JSON, in this",
    "order. They are assembled outside the Live device, so none of them is a",
    "field on the result:",
    "",
  ];

  for (const block of blocks) {
    const blockLines = block.split("\n");
    const isLong = blockLines.length > LONG_BLOCK_LINES;
    const shown = isLong ? blockLines.slice(0, LONG_BLOCK_PREVIEW) : blockLines;

    lines.push("```", ...shown);

    if (isLong) {
      lines.push(`… ${blockLines.length - shown.length} more lines`);
    }

    lines.push("```", "");
  }

  return lines;
}
