// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { buildModelMessages } from "#webui/chat/sdk/client";

describe("buildModelMessages", () => {
  it("merges consecutive user turns into a single user message", () => {
    // A compaction summary (synthetic user message) followed by the next real
    // user message: Gemini and Mistral reject two user turns in a row.
    const result = buildModelMessages([
      {
        role: "user",
        content: "summary of earlier turns",
        isCompactionSummary: true,
      },
      { role: "user", content: "now add a bass line" },
    ]);

    expect(result).toStrictEqual([
      {
        role: "user",
        content: "summary of earlier turns\n\nnow add a bass line",
      },
    ]);
  });

  it("keeps alternating turns separate", () => {
    const result = buildModelMessages([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
    ]);

    expect(result).toStrictEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
    ]);
  });

  it("does not merge a user turn across a tool-result message", () => {
    // An assistant turn with tool calls emits an assistant message plus a tool
    // message, so a following user turn must not fold into the earlier user.
    const result = buildModelMessages([
      { role: "user", content: "u1" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "1", name: "read-song", args: {} }],
        toolResults: [{ id: "1", name: "read-song", args: {}, result: "ok" }],
      },
      { role: "user", content: "u2" },
    ]);

    expect(result.map((m) => m.role)).toStrictEqual([
      "user",
      "assistant",
      "tool",
      "user",
    ]);
    expect(result.at(-1)).toStrictEqual({ role: "user", content: "u2" });
  });
});
