// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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

  it.each([
    { count: 1, label: "1 image" },
    { count: 2, label: "2 images" },
  ])("notes that $label were attached", ({ count, label }) => {
    const history: ChatMessage[] = [
      {
        role: "user",
        content: "match this",
        images: Array.from({ length: count }, () => ({
          mediaType: "image/png",
          data: "AAA",
        })),
      },
    ];

    expect(renderTranscript(history)).toBe(
      `USER: [${label} attached] match this`,
    );
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

describe("compacting a conversation that was compacted before", () => {
  const history: ChatMessage[] = [
    { role: "user", content: "make a beat" },
    { role: "assistant", content: "done, 120 bpm" },
    { role: "user", content: "Key: C minor.", isCompactionSummary: true },
    { role: "user", content: "add a bass" },
    { role: "assistant", content: "added" },
  ];

  it("renders only from the last summary on", () => {
    expect(renderTranscript(history)).toBe(
      "SUMMARY OF THE EARLIER CONVERSATION: Key: C minor.\n" +
        "USER: add a bass\n" +
        "ASSISTANT: added",
    );
  });

  it("starts at the newest of several summaries", () => {
    const twice: ChatMessage[] = [
      ...history,
      {
        role: "user",
        content: "Key: C minor. Bass added.",
        isCompactionSummary: true,
      },
      { role: "user", content: "now drums" },
    ];

    expect(renderTranscript(twice)).toBe(
      "SUMMARY OF THE EARLIER CONVERSATION: Key: C minor. Bass added.\n" +
        "USER: now drums",
    );
  });

  it("tells the model to carry the earlier summary forward", () => {
    expect(COMPACTION_PROMPT).toContain("summary of the earlier conversation");
  });
});
