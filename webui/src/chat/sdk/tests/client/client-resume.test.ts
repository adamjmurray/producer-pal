// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, streamText: vi.fn(), generateText: vi.fn() };
});

vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockResolvedValue({ tools: {}, mcpClient: {} }),
}));

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { ChatSdkClient } from "#webui/chat/sdk/client";
import {
  createConfig,
  mockStreamParts,
  toolStepHistory,
} from "#webui/chat/sdk/tests/client-test-helpers";
import { type ChatMessage } from "#webui/chat/sdk/types";

/** A completed one-step response. */
const DONE_PARTS = [
  { type: "text-delta", text: "Done." },
  { type: "finish", finishReason: "stop" },
];

/**
 * Drain a resume over a client seeded with the given history.
 * @param history - The history the retry resumes from
 * @returns The client, so callers can read its resulting chatHistory
 */
async function resumeOver(history: ChatMessage[]): Promise<ChatSdkClient> {
  const client = new ChatSdkClient("key", createConfig());

  client.chatHistory.push(...history);
  mockStreamParts(DONE_PARTS);

  for await (const _ of client.resumeStream()) {
    /* consume */
  }

  return client;
}

describe("resumeStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never re-sends the user's message", async () => {
    // The message is already in history — that is what makes a retry a resume.
    // Re-sending it duplicated the instruction in the transcript and, because
    // consecutive user turns are concatenated for the wire, asked the model twice.
    const client = await resumeOver([{ role: "user", content: "add a bass" }]);

    expect(client.chatHistory.filter((m) => m.role === "user")).toStrictEqual([
      { role: "user", content: "add a bass" },
    ]);
  });

  it("adds nothing when the conversation already ends on a user turn", async () => {
    const client = await resumeOver([{ role: "user", content: "add a bass" }]);

    expect(client.chatHistory.map((m) => m.content)).toStrictEqual([
      "add a bass",
      "Done.",
    ]);
  });

  it("adds nothing after a tool step, whose wire form ends on tool results", async () => {
    // The shape most rate limits here actually take: earlier tool steps
    // succeeded and a later step's request was refused. Ending on tool results
    // is already a valid continuation point.
    const client = await resumeOver(toolStepHistory("add a bass"));

    expect(client.chatHistory.map((m) => m.content)).toStrictEqual([
      "add a bass",
      "Creating it.",
      "Done.",
    ]);
  });

  it("appends one continue turn when the conversation ends on assistant text", async () => {
    // The one shape that is not a valid request: the model streamed text and
    // then the error surfaced. Gemini and Mistral reject a trailing assistant
    // turn, so the resume has to make it a question again.
    const client = await resumeOver([
      { role: "user", content: "add a bass" },
      { role: "assistant", content: "Working on it…" },
    ]);

    expect(client.chatHistory.map((m) => m.content)).toStrictEqual([
      "add a bass",
      "Working on it…",
      "continue",
      "Done.",
    ]);
  });

  it("does not stack a second continue on a later retry", async () => {
    // A resume that itself gets rate-limited leaves "continue" as the last turn.
    // Appending another would send the model "continue\n\ncontinue".
    const client = await resumeOver([
      { role: "user", content: "add a bass" },
      { role: "assistant", content: "Working on it…" },
      { role: "user", content: "continue" },
    ]);

    expect(
      client.chatHistory.filter((m) => m.content === "continue"),
    ).toHaveLength(1);
  });

  it("keeps partial work rather than rewinding it", async () => {
    const client = await resumeOver([
      { role: "user", content: "add a bass" },
      { role: "assistant", content: "Wrote the first half." },
    ]);

    expect(client.chatHistory.map((m) => m.content)).toContain(
      "Wrote the first half.",
    );
  });
});
