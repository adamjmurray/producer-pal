// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { describe, expect, it } from "vitest";
import { realtimeItemsToUIMessages } from "#webui/hooks/voice/realtime-items-to-ui-messages";

function userMessage(itemId: string, transcript: string): RealtimeItem {
  return {
    itemId,
    type: "message",
    role: "user",
    status: "completed",
    content: [{ type: "input_audio", transcript }],
  };
}

function assistantMessage(itemId: string, transcript: string): RealtimeItem {
  return {
    itemId,
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_audio", transcript }],
  };
}

function functionCall(
  itemId: string,
  name: string,
  args: string,
  output: string | null,
): RealtimeItem {
  return {
    itemId,
    type: "function_call",
    status: output == null ? "in_progress" : "completed",
    name,
    arguments: args,
    output,
  };
}

describe("realtimeItemsToUIMessages", () => {
  it("returns an empty array for empty input", () => {
    expect(realtimeItemsToUIMessages([])).toStrictEqual([]);
  });

  it("maps a user audio message to a user UIMessage with text part", () => {
    const result = realtimeItemsToUIMessages([userMessage("u1", "hello pal")]);

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
    expect(result[0]?.parts).toStrictEqual([
      { type: "text", content: "hello pal" },
    ]);
  });

  it("maps an assistant audio message to a model UIMessage", () => {
    const result = realtimeItemsToUIMessages([
      assistantMessage("a1", "hi there"),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("model");
    expect(result[0]?.parts).toStrictEqual([
      { type: "text", content: "hi there" },
    ]);
  });

  it("supports input_text and output_text content variants", () => {
    const result = realtimeItemsToUIMessages([
      {
        itemId: "u1",
        type: "message",
        role: "user",
        status: "completed",
        content: [{ type: "input_text", text: "typed input" }],
      },
      {
        itemId: "a1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "typed reply" }],
      },
    ]);

    expect(result[0]?.parts).toStrictEqual([
      { type: "text", content: "typed input" },
    ]);
    expect(result[1]?.parts).toStrictEqual([
      { type: "text", content: "typed reply" },
    ]);
  });

  it("skips messages whose content has no text yet", () => {
    expect(
      realtimeItemsToUIMessages([
        {
          itemId: "u1",
          type: "message",
          role: "user",
          status: "in_progress",
          content: [{ type: "input_audio", transcript: null }],
        },
      ]),
    ).toStrictEqual([]);
  });

  it("skips an assistant message whose transcript hasn't arrived yet", () => {
    expect(
      realtimeItemsToUIMessages([
        {
          itemId: "a1",
          type: "message",
          role: "assistant",
          status: "in_progress",
          content: [{ type: "output_audio", transcript: null }],
        },
      ]),
    ).toStrictEqual([]);
  });

  it("groups a function_call into the preceding assistant message", () => {
    const result = realtimeItemsToUIMessages([
      userMessage("u1", "rename track 1 to drums"),
      functionCall(
        "f1",
        "ppal-update-track",
        '{"trackIndex":0,"name":"Drums"}',
        '{"ok":true}',
      ),
      assistantMessage("a1", "Done."),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.role).toBe("user");
    expect(result[1]?.role).toBe("model");
    expect(result[1]?.parts).toStrictEqual([
      {
        type: "tool",
        name: "ppal-update-track",
        args: { trackIndex: 0, name: "Drums" },
        result: '{"ok":true}',
      },
      { type: "text", content: "Done." },
    ]);
  });

  it("starts a new model message after a user turn even if tools precede assistant text", () => {
    const result = realtimeItemsToUIMessages([
      userMessage("u1", "what tracks are there"),
      functionCall("f1", "ppal-read-song", "{}", '{"tracks":["Drums"]}'),
      assistantMessage("a1", "One track: Drums."),
      userMessage("u2", "thanks"),
      assistantMessage("a2", "Anytime."),
    ]);

    expect(result.map((m) => m.role)).toStrictEqual([
      "user",
      "model",
      "user",
      "model",
    ]);
    expect(result[1]?.parts).toHaveLength(2); // tool + text
    expect(result[3]?.parts).toHaveLength(1); // text only
  });

  it("renders a pending tool call (output: null) with result: null", () => {
    const result = realtimeItemsToUIMessages([
      userMessage("u1", "do it"),
      functionCall("f1", "ppal-do", "{}", null),
    ]);

    const tool = result[1]?.parts[0];

    expect(tool).toMatchObject({
      type: "tool",
      name: "ppal-do",
      result: null,
    });
    expect((tool as { isError?: boolean }).isError).toBeUndefined();
  });

  it("flags MCP wrapper error strings as isError", () => {
    const result = realtimeItemsToUIMessages([
      userMessage("u1", "do it"),
      functionCall("f1", "ppal-do", "{}", "Error from ppal-do: clip not found"),
      functionCall(
        "f2",
        "ppal-other",
        "{}",
        "Error calling ppal-other: network",
      ),
    ]);

    const parts = result[1]?.parts ?? [];

    expect((parts[0] as { isError?: boolean }).isError).toBe(true);
    expect((parts[1] as { isError?: boolean }).isError).toBe(true);
  });

  it("falls back to empty args when arguments JSON is malformed", () => {
    const result = realtimeItemsToUIMessages([
      userMessage("u1", "go"),
      functionCall("f1", "ppal-do", "not-json", '{"ok":true}'),
    ]);

    const tool = result[1]?.parts[0] as { args: Record<string, unknown> };

    expect(tool.args).toStrictEqual({});
  });

  it("maps mcp_call and mcp_tool_call items to tool parts", () => {
    const result = realtimeItemsToUIMessages([
      userMessage("u1", "go"),
      {
        itemId: "m1",
        type: "mcp_call",
        status: "completed",
        name: "remote-tool",
        arguments: '{"x":1}',
        output: "ok",
      },
      {
        itemId: "m2",
        type: "mcp_tool_call",
        status: "completed",
        name: "remote-tool-2",
        arguments: '{"y":2}',
        output: "ok2",
      },
    ]);

    expect(result[1]?.parts).toStrictEqual([
      { type: "tool", name: "remote-tool", args: { x: 1 }, result: "ok" },
      { type: "tool", name: "remote-tool-2", args: { y: 2 }, result: "ok2" },
    ]);
  });

  it("ignores system messages and mcp_approval_request items", () => {
    const result = realtimeItemsToUIMessages([
      {
        itemId: "s1",
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: "system prompt" }],
      },
      userMessage("u1", "hi"),
      {
        itemId: "ar1",
        type: "mcp_approval_request",
        serverLabel: "x",
        name: "y",
        arguments: {},
        approved: null,
      },
      assistantMessage("a1", "hello"),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.role)).toStrictEqual(["user", "model"]);
  });

  it("collapses consecutive assistant messages into one model UIMessage", () => {
    const result = realtimeItemsToUIMessages([
      userMessage("u1", "go"),
      assistantMessage("a1", "First."),
      assistantMessage("a2", "Second."),
    ]);

    expect(result).toHaveLength(2);
    expect(result[1]?.parts).toStrictEqual([
      { type: "text", content: "First." },
      { type: "text", content: "Second." },
    ]);
  });

  it("assigns rawHistoryIndex to the originating item index", () => {
    const items: RealtimeItem[] = [
      userMessage("u1", "a"),
      assistantMessage("a1", "b"),
      userMessage("u2", "c"),
    ];
    const result = realtimeItemsToUIMessages(items);

    expect(result[0]?.rawHistoryIndex).toBe(0);
    expect(result[1]?.rawHistoryIndex).toBe(1);
    expect(result[2]?.rawHistoryIndex).toBe(2);
  });
});
