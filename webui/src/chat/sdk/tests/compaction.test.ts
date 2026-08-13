// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LanguageModel, generateText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { type ChatMessage } from "#webui/chat/sdk/types";

vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, generateText: vi.fn() };
});

import {
  COMPACTION_PROMPT,
  renderTranscript,
  summarizeHistory,
} from "#webui/chat/sdk/compaction";

const model = { modelId: "test" } as unknown as LanguageModel;

describe("renderTranscript", () => {
  it("renders user and assistant text turns", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "make a beat" },
      { role: "assistant", content: "on it" },
    ];

    expect(renderTranscript(history)).toBe(
      "USER: make a beat\nASSISTANT: on it",
    );
  });

  it("renders tool calls and results, stringifying non-string results", () => {
    const history: ChatMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "1", name: "read-song", args: { x: 1 } }],
        toolResults: [
          { id: "1", name: "read-song", args: {}, result: { tempo: 120 } },
          { id: "2", name: "note", args: {}, result: "ok" },
        ],
      },
    ];

    const out = renderTranscript(history);

    expect(out).toContain('ASSISTANT called read-song({"x":1})');
    expect(out).toContain('TOOL read-song => {"tempo":120}');
    expect(out).toContain("TOOL note => ok");
  });

  it("skips error messages", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "boom", isError: true },
      { role: "user", content: "hi" },
    ];

    expect(renderTranscript(history)).toBe("USER: hi");
  });
});

describe("summarizeHistory", () => {
  it("summarizes the transcript with the compaction prompt and trims", async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "  the summary  ",
    });

    const result = await summarizeHistory(model, [
      { role: "user", content: "hi" },
    ]);

    expect(result).toBe("the summary");

    const call = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    expect(call.instructions).toBe(COMPACTION_PROMPT);
    expect(call.messages[0].content).toContain("USER: hi");
    expect(call.messages[0].content).toContain("Summarize the conversation");
  });
});
