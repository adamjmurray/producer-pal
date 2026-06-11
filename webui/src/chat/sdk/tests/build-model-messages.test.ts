// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { buildModelMessages } from "#webui/chat/sdk/build-model-messages";

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

  it("starts the model payload at the compaction summary, dropping prior turns", () => {
    // Compaction keeps the prior turns in history for display, but the model
    // should only see the summary and everything after it.
    const result = buildModelMessages([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "summary", isCompactionSummary: true },
      { role: "user", content: "continue from here" },
    ]);

    expect(result).toStrictEqual([
      { role: "user", content: "summary\n\ncontinue from here" },
    ]);
  });

  it("uses the most recent summary when the history is compacted twice", () => {
    const result = buildModelMessages([
      { role: "user", content: "u1" },
      { role: "user", content: "first summary", isCompactionSummary: true },
      { role: "assistant", content: "a1" },
      { role: "user", content: "second summary", isCompactionSummary: true },
      { role: "assistant", content: "a2" },
    ]);

    expect(result).toStrictEqual([
      { role: "user", content: "second summary" },
      { role: "assistant", content: "a2" },
    ]);
  });

  it("returns the full history when there is no compaction summary", () => {
    const result = buildModelMessages([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);

    expect(result).toStrictEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
  });

  describe("reasoning re-emission", () => {
    const withReasoning = {
      role: "assistant" as const,
      content: "answer",
      reasoningParts: [{ text: "thinking", signature: "sig-1" }],
    };

    it("re-emits a signed reasoning block before the text when enabled", () => {
      const result = buildModelMessages([withReasoning], true);

      expect(result[0]!.content).toStrictEqual([
        {
          type: "reasoning",
          text: "thinking",
          providerOptions: { anthropic: { signature: "sig-1" } },
        },
        { type: "text", text: "answer" },
      ]);
    });

    it("re-emits reasoning before tool calls", () => {
      const result = buildModelMessages(
        [
          {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "t1", name: "read-song", args: {} }],
            toolResults: [
              { id: "t1", name: "read-song", args: {}, result: "ok" },
            ],
            reasoningParts: [{ text: "plan", signature: "sig-2" }],
          },
        ],
        true,
      );

      expect(result[0]!.content).toStrictEqual([
        {
          type: "reasoning",
          text: "plan",
          providerOptions: { anthropic: { signature: "sig-2" } },
        },
        {
          type: "tool-call",
          toolCallId: "t1",
          toolName: "read-song",
          input: {},
        },
      ]);
    });

    it("re-emits redacted reasoning as an empty block", () => {
      const result = buildModelMessages(
        [
          {
            role: "assistant",
            content: "answer",
            reasoningParts: [{ text: "", redactedData: "redacted-blob" }],
          },
        ],
        true,
      );

      expect(result[0]!.content).toStrictEqual([
        {
          type: "reasoning",
          text: "",
          providerOptions: { anthropic: { redactedData: "redacted-blob" } },
        },
        { type: "text", text: "answer" },
      ]);
    });

    it("keeps plain string content when reasoning is not requested", () => {
      const result = buildModelMessages([withReasoning], false);

      expect(result[0]!.content).toBe("answer");
    });

    it("keeps plain string content when a block has no signature", () => {
      const result = buildModelMessages(
        [
          {
            role: "assistant",
            content: "answer",
            reasoningParts: [{ text: "t" }],
          },
        ],
        true,
      );

      expect(result[0]!.content).toBe("answer");
    });
  });
});
