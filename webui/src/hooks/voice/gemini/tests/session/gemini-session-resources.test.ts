// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Session } from "@google/genai";
import { type RealtimeItem } from "@openai/agents/realtime";
import { describe, expect, it, vi } from "vitest";
import { seedGeminiContext } from "#webui/hooks/voice/gemini/gemini-session-resources";

describe("seedGeminiContext", () => {
  it("is a no-op for empty or missing history", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;

    seedGeminiContext(session, undefined);
    seedGeminiContext(session, []);

    expect(sendClientContent).not.toHaveBeenCalled();
  });

  it("sends prior message transcripts as a non-triggering context turn", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;
    const history: RealtimeItem[] = [
      {
        itemId: "1",
        type: "message",
        role: "user",
        status: "completed",
        content: [{ type: "input_audio", transcript: "set tempo to 128" }],
      },
      {
        itemId: "2",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "Done." }],
      },
      // function_call + system items are skipped by the transcript flattener.
      {
        itemId: "3",
        type: "function_call",
        status: "completed",
        name: "ppal-x",
        arguments: "{}",
        output: "ok",
      },
    ];

    seedGeminiContext(session, history);

    expect(sendClientContent).toHaveBeenCalledTimes(1);
    const arg = sendClientContent.mock.calls[0]![0] as {
      turns: { parts: { text: string }[] }[];
      turnComplete: boolean;
    };

    expect(arg.turnComplete).toBe(false);
    const text = arg.turns[0]!.parts[0]!.text;

    expect(text).toContain("User: set tempo to 128");
    expect(text).toContain("You: Done.");
    expect(text).not.toContain("ppal-x");
  });

  it("skips system items and reads both text and (null) transcript content", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;
    // A system message (skipped), then a user message mixing a text part, a
    // null-transcript audio part, and a bare part (no usable text).
    const history = [
      { role: "system", content: [{ type: "input_text", text: "SYSTEM" }] },
      {
        role: "user",
        content: [
          { type: "input_text", text: "hello there" },
          { type: "input_audio", transcript: null },
          { type: "input_image" },
        ],
      },
    ].map((m, i) => ({
      itemId: String(i),
      type: "message",
      status: "completed",
      ...m,
    })) as unknown as RealtimeItem[];

    seedGeminiContext(session, history);

    const arg = sendClientContent.mock.calls[0]![0] as {
      turns: { parts: { text: string }[] }[];
    };

    expect(arg.turns[0]!.parts[0]!.text).toContain("User: hello there");
    expect(arg.turns[0]!.parts[0]!.text).not.toContain("SYSTEM");
  });

  it("is a no-op when history has no usable transcript text", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;
    const history: RealtimeItem[] = [
      {
        itemId: "1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "" }],
      },
    ];

    seedGeminiContext(session, history);

    expect(sendClientContent).not.toHaveBeenCalled();
  });
});
