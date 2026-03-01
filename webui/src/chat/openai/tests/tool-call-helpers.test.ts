// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { type OpenAIToolCall } from "#webui/types/messages";
import {
  accumulateToolCall,
  sanitizeToolCallArguments,
} from "#webui/chat/openai/tool-call-helpers";

type ToolCallDelta =
  OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall;

/** Function tool call with narrowed type for test assertions */
interface FunctionToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Creates a tool call delta for testing.
 * @param index - Tool call index
 * @param id - Tool call ID
 * @param name - Function name
 * @param args - JSON arguments string
 * @returns Tool call delta object
 */
function createDelta(
  index: number,
  id?: string,
  name?: string,
  args?: string,
): ToolCallDelta {
  return {
    index,
    ...(id != null ? { id } : {}),
    ...(name != null || args != null
      ? {
          function: {
            ...(name != null ? { name } : {}),
            ...(args != null ? { arguments: args } : {}),
          },
        }
      : {}),
  };
}

/**
 * Gets a function tool call from the map for assertions.
 * @param map - Tool calls map
 * @param key - Map key
 * @returns Function tool call
 */
function getFn(
  map: Map<number, OpenAIToolCall>,
  key: number,
): FunctionToolCall {
  return map.get(key) as FunctionToolCall;
}

describe("accumulateToolCall", () => {
  it("accumulates standard OpenAI parallel tool calls with different indices", () => {
    const map = new Map<number, OpenAIToolCall>();

    accumulateToolCall(
      createDelta(0, "call_1", "search", '{"query": "foo"}'),
      map,
    );
    accumulateToolCall(
      createDelta(1, "call_2", "calculate", '{"expr": "2+2"}'),
      map,
    );
    accumulateToolCall(
      createDelta(2, "call_3", "lookup", '{"id": "123"}'),
      map,
    );

    expect(map.size).toBe(3);
    expect(getFn(map, 0).function.name).toBe("search");
    expect(getFn(map, 1).function.name).toBe("calculate");
    expect(getFn(map, 2).function.name).toBe("lookup");
  });

  it("concatenates partial arguments for same index and same ID", () => {
    const map = new Map<number, OpenAIToolCall>();

    accumulateToolCall(createDelta(0, "call_1", "search", '{"query":'), map);
    accumulateToolCall(createDelta(0, "call_1", undefined, ' "foo"}'), map);

    expect(map.size).toBe(1);
    expect(getFn(map, 0).function.arguments).toBe('{"query": "foo"}');
  });

  it("concatenates arguments when continuation delta has no ID", () => {
    const map = new Map<number, OpenAIToolCall>();

    accumulateToolCall(createDelta(0, "call_1", "search", '{"q":'), map);
    accumulateToolCall(createDelta(0, undefined, undefined, '"v"}'), map);

    expect(map.size).toBe(1);
    expect(getFn(map, 0).id).toBe("call_1");
    expect(getFn(map, 0).function.arguments).toBe('{"q":"v"}');
  });

  it("separates Ollama parallel tool calls with same index but different IDs", () => {
    const map = new Map<number, OpenAIToolCall>();

    accumulateToolCall(
      createDelta(0, "call_a", "create-track", '{"name":"Drums"}'),
      map,
    );
    accumulateToolCall(
      createDelta(0, "call_b", "create-track", '{"name":"Bass"}'),
      map,
    );
    accumulateToolCall(
      createDelta(0, "call_c", "create-track", '{"name":"Keys"}'),
      map,
    );

    expect(map.size).toBe(3);
    expect(getFn(map, 0).id).toBe("call_a");
    expect(getFn(map, 0).function.arguments).toBe('{"name":"Drums"}');
    expect(getFn(map, 1).id).toBe("call_b");
    expect(getFn(map, 1).function.arguments).toBe('{"name":"Bass"}');
    expect(getFn(map, 2).id).toBe("call_c");
    expect(getFn(map, 2).function.arguments).toBe('{"name":"Keys"}');
  });

  it("skips accumulation for non-function tool call entries", () => {
    const map = new Map<number, OpenAIToolCall>();

    map.set(0, {
      id: "call_1",
      type: "custom" as "function",
      custom: { data: "test" },
    } as unknown as OpenAIToolCall);

    accumulateToolCall(createDelta(0, "call_1", undefined, '{"a":"b"}'), map);

    // Entry should remain unchanged (no function property to update)
    expect(
      (map.get(0) as unknown as { custom: { data: string } }).custom.data,
    ).toBe("test");
  });

  it("handles initial delta with empty ID followed by Ollama-style delta", () => {
    const map = new Map<number, OpenAIToolCall>();

    // First delta has no ID (empty string in map)
    accumulateToolCall(createDelta(0, undefined, "search", '{"q":"v"}'), map);
    // Second delta has an ID — should still merge because existing.id is empty
    accumulateToolCall(createDelta(0, "call_b", "other", '{"x":"y"}'), map);

    // Should merge because existing.id was empty (falsy)
    expect(map.size).toBe(1);
    expect(getFn(map, 0).id).toBe("call_b");
  });
});

describe("sanitizeToolCallArguments", () => {
  it("passes through valid JSON arguments unchanged", () => {
    const toolCalls: OpenAIToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "search", arguments: '{"query": "test"}' },
      },
    ];

    const result = sanitizeToolCallArguments(toolCalls);

    expect(result).toStrictEqual(toolCalls);
  });

  it("replaces invalid JSON with '{}' and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const toolCalls: OpenAIToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "create-track",
          arguments: '{"name":"Drums"}{"name":"Bass"}',
        },
      },
    ];

    const result = sanitizeToolCallArguments(toolCalls);
    const fn = result[0] as FunctionToolCall;

    expect(fn.function.arguments).toBe("{}");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Sanitized malformed arguments"),
      '{"name":"Drums"}{"name":"Bass"}',
    );

    warnSpy.mockRestore();
  });

  it("handles empty arguments string", () => {
    const toolCalls: OpenAIToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "connect", arguments: "" },
      },
    ];

    const result = sanitizeToolCallArguments(toolCalls);
    const fn = result[0] as FunctionToolCall;

    expect(fn.function.arguments).toBe("");
  });

  it("passes through non-function tool calls unchanged", () => {
    const customToolCall = {
      id: "call_1",
      type: "custom" as const,
      custom: { data: "test" },
    } as unknown as OpenAIToolCall;

    const result = sanitizeToolCallArguments([customToolCall]);

    expect(result[0]).toBe(customToolCall);
  });

  it("handles multiple tool calls with mixed validity", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const toolCalls: OpenAIToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "search", arguments: '{"q": "ok"}' },
      },
      {
        id: "call_2",
        type: "function",
        function: { name: "bad", arguments: "{invalid" },
      },
    ];

    const result = sanitizeToolCallArguments(toolCalls);
    const fn0 = result[0] as FunctionToolCall;
    const fn1 = result[1] as FunctionToolCall;

    expect(fn0.function.arguments).toBe('{"q": "ok"}');
    expect(fn1.function.arguments).toBe("{}");

    warnSpy.mockRestore();
  });
});
