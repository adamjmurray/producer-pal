// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { formatTranscript } from "../../llm-judge.ts";
import {
  injectedBlockLines,
  MAX_SHOWN_BLOCK_CHARS,
} from "../injected-blocks-transcript.ts";

const callWith = (injectedBlocks?: string[]) => ({
  userMessage: "update",
  assistantResponse: "all good",
  toolCalls: [
    {
      name: "ppal-connect",
      args: { versionCheck: true },
      result: "payload",
      injectedBlocks,
      warnings: ["WARNING: heads up"],
    },
  ],
});

describe("injectedBlockLines", () => {
  it("shows a short block in full", () => {
    expect(injectedBlockLines(["remoteScript: v2.5.1 running"])).toStrictEqual([
      "    + remoteScript: v2.5.1 running",
    ]);
  });

  it("indents the later lines of a multi-line block", () => {
    expect(injectedBlockLines(["Memory index.\n\n- `a` — b"])).toStrictEqual([
      "    + Memory index.\n      \n      - `a` — b",
    ]);
  });

  it("shows a block of exactly the limit in full", () => {
    const text = "x".repeat(MAX_SHOWN_BLOCK_CHARS);

    expect(injectedBlockLines([text])).toStrictEqual([`    + ${text}`]);
  });

  it("replaces a long block with its heading and size", () => {
    const text = `# Producer Pal Skills\n\n${"x".repeat(MAX_SHOWN_BLOCK_CHARS)}`;
    const [line] = injectedBlockLines([text]);

    expect(line).toBe(
      `    + [long block omitted: "# Producer Pal Skills" (${text.length} chars)]`,
    );
  });

  it("cuts a long first line down to a short title", () => {
    const [line] = injectedBlockLines(["y".repeat(MAX_SHOWN_BLOCK_CHARS + 1)]);

    expect(line).toBe(
      `    + [long block omitted: "${"y".repeat(60)}…" (${MAX_SHOWN_BLOCK_CHARS + 1} chars)]`,
    );
  });

  it("returns nothing when there are no blocks", () => {
    expect(injectedBlockLines(undefined)).toStrictEqual([]);
  });
});

describe("formatTranscript with injected blocks", () => {
  it("lists the blocks after the result and before the warnings", () => {
    const transcript = formatTranscript([
      callWith([
        "remoteScript: v2.5.1 running",
        `# Producer Pal Skills\n${"x".repeat(5000)}`,
      ]),
    ]);

    expect(transcript).toContain(
      [
        "    → payload",
        "    + remoteScript: v2.5.1 running",
        '    + [long block omitted: "# Producer Pal Skills" (5022 chars)]',
        "    WARNING: heads up",
      ].join("\n"),
    );
    expect(transcript).not.toContain("xxxx");
  });

  it("is unchanged for a call with no blocks", () => {
    expect(formatTranscript([callWith()])).not.toContain("    + ");
  });
});
