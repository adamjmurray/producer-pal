// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";
import { realtimeItemsToUIMessages } from "#webui/hooks/voice/realtime-items-to-ui-messages";
import { GEM_ITEM_ID } from "#webui/hooks/voice/gemini/tests/gemini-message-handler-test-helpers";

describe("GeminiHistoryBuilder", () => {
  it("accumulates user + assistant transcript deltas into messages", () => {
    const b = new GeminiHistoryBuilder();

    b.addUserTranscript("set the ");
    b.addUserTranscript("tempo to 128");
    b.addAssistantTranscript("Tempo ");
    b.addAssistantTranscript("set to 128.");

    const items = b.toRealtimeItems();

    expect(items).toHaveLength(2);
    expect(items[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      status: "completed",
      type: "message",
      role: "user",
      content: [{ type: "input_audio", transcript: "set the tempo to 128" }],
    });
    expect(items[1]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [{ type: "output_audio", transcript: "Tempo set to 128." }],
    });
  });

  it("marks the assistant turn completed on completeTurn", () => {
    const b = new GeminiHistoryBuilder();

    b.addAssistantTranscript("Hi there!");
    b.completeTurn();

    expect(b.toRealtimeItems()[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_audio", transcript: "Hi there!" }],
    });
  });

  it("records tool calls and fills output by id, ordered text → tool → text", () => {
    const b = new GeminiHistoryBuilder();

    b.addAssistantTranscript("One moment.");
    b.addToolCall("call-1", "ppal-update-live-set", { tempo: 128 });
    b.setToolOutput("call-1", "Tempo updated.");
    b.addAssistantTranscript("Done!");

    const items = b.toRealtimeItems();

    expect(items.map((i) => i.type)).toStrictEqual([
      "message",
      "function_call",
      "message",
    ]);
    expect(items[1]).toStrictEqual({
      itemId: "call-1",
      type: "function_call",
      name: "ppal-update-live-set",
      arguments: JSON.stringify({ tempo: 128 }),
      output: "Tempo updated.",
      status: "completed",
    });
    // A pending tool call (no output yet) is in_progress.
    const b2 = new GeminiHistoryBuilder();

    b2.addToolCall("c", "ppal-x", {});
    expect(b2.toRealtimeItems()[0]).toStrictEqual({
      arguments: "{}",
      itemId: "c",
      name: "ppal-x",
      output: null,
      type: "function_call",
      status: "in_progress",
    });
  });

  it("ignores an output for a call id it never recorded", () => {
    const b = new GeminiHistoryBuilder();

    b.addToolCall("c1", "ppal-x", {});
    b.setToolOutput("unknown", "ok");

    expect(b.toRealtimeItems()[0]).toHaveProperty("output", null);
  });

  it("starts a new user turn after an assistant reply (barge-in / next turn)", () => {
    const b = new GeminiHistoryBuilder();

    b.addUserTranscript("hello");
    b.addAssistantTranscript("hi");
    b.addUserTranscript("what can you do");

    const items = b.toRealtimeItems();

    expect(items.map((i) => i.type === "message" && i.role)).toStrictEqual([
      "user",
      "assistant",
      "user",
    ]);
    // The interrupted assistant turn is closed when the user speaks again.
    expect(items[1]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_audio", transcript: "hi" }],
    });
  });

  it("ignores empty transcript deltas", () => {
    const b = new GeminiHistoryBuilder();

    b.addUserTranscript("");
    b.addAssistantTranscript("");

    expect(b.toRealtimeItems()).toHaveLength(0);
  });

  it("produces fresh objects each snapshot (no shared mutable state)", () => {
    const b = new GeminiHistoryBuilder();

    b.addAssistantTranscript("a");
    const first = b.toRealtimeItems();

    b.addAssistantTranscript("b");
    const second = b.toRealtimeItems();

    expect(first[0]).not.toBe(second[0]);
    expect(first[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [{ type: "output_audio", transcript: "a" }],
    });
  });

  it("round-trips through realtimeItemsToUIMessages into chat UIMessages", () => {
    const b = new GeminiHistoryBuilder();

    b.addUserTranscript("set tempo to 128");
    b.addAssistantTranscript("Sure.");
    b.addToolCall("c1", "ppal-update-live-set", { tempo: 128 });
    b.setToolOutput("c1", "ok");
    b.addAssistantTranscript("Done!");
    b.completeTurn();

    const messages = realtimeItemsToUIMessages(b.toRealtimeItems());

    expect(messages).toHaveLength(2);
    expect(messages[0]).toStrictEqual({
      rawHistoryIndex: 0,
      timestamp: 0,
      role: "user",
      parts: [{ type: "text", content: "set tempo to 128" }],
    });
    expect(messages[1]?.role).toBe("model");
    const types = messages[1]?.parts.map((p) => p.type);

    expect(types).toStrictEqual(["text", "tool", "text"]);
  });
});
