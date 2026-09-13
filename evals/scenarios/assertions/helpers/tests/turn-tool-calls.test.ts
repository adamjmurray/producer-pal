// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { type EvalTurnResult, type ToolCall } from "../../../types.ts";
import {
  getAllToolCalls,
  getTargetTurns,
  getToolCalls,
  lastSuccessfulToolCall,
  parsedToolResult,
  toolCallFailed,
} from "../turn-tool-calls.ts";

describe("getTargetTurns", () => {
  const mockTurns: EvalTurnResult[] = [
    {
      turnIndex: 0,
      userMessage: "first",
      assistantResponse: "a",
      toolCalls: [],
      durationMs: 100,
    },
    {
      turnIndex: 1,
      userMessage: "second",
      assistantResponse: "b",
      toolCalls: [],
      durationMs: 200,
    },
  ];

  it("returns all turns for 'any'", () => {
    expect(getTargetTurns(mockTurns, "any")).toStrictEqual(mockTurns);
  });

  it("returns all turns for undefined", () => {
    expect(getTargetTurns(mockTurns, undefined)).toStrictEqual(mockTurns);
  });

  it("returns specific turn by index", () => {
    expect(getTargetTurns(mockTurns, 1)).toStrictEqual([mockTurns[1]]);
  });

  it("returns first turn when index is 0", () => {
    expect(getTargetTurns(mockTurns, 0)).toStrictEqual([mockTurns[0]]);
  });

  it("returns empty array for out-of-bounds index", () => {
    expect(getTargetTurns(mockTurns, 5)).toStrictEqual([]);
  });

  it("returns empty array for negative index", () => {
    expect(getTargetTurns(mockTurns, -1)).toStrictEqual([]);
  });

  it("handles empty turns array", () => {
    expect(getTargetTurns([], "any")).toStrictEqual([]);
    expect(getTargetTurns([], 0)).toStrictEqual([]);
  });
});

describe("parsedToolResult", () => {
  const call = (result?: string): ToolCall => ({
    name: "ppal-create-clip",
    args: {},
    result,
  });

  it("parses a compact-literal success payload", () => {
    expect(
      parsedToolResult(call('{id:"84",slot:"3/0",noteCount:8}')),
    ).toStrictEqual({
      id: "84",
      slot: "3/0",
      noteCount: 8,
    });
  });

  it("returns null for a tool error", () => {
    expect(
      parsedToolResult(call("Error: slot or arrangementStart is required")),
    ).toBeNull();
  });

  it("returns null for a cancelled call", () => {
    expect(parsedToolResult(call("ERROR: user cancelled MCP tool call"))).toBe(
      null,
    );
  });

  it("returns null when there is no result", () => {
    expect(parsedToolResult(call())).toBeNull();
  });

  it("returns null for a payload that isn't an object", () => {
    expect(parsedToolResult(call("42"))).toBeNull();
  });
});

describe("lastSuccessfulToolCall", () => {
  const turn = (...toolCalls: ToolCall[]): EvalTurnResult => ({
    turnIndex: 0,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls,
    durationMs: 1,
  });

  const errored: ToolCall = {
    name: "ppal-create-clip",
    args: { trackIndex: 3, sceneIndex: "0" },
    result: "Error: slot or arrangementStart is required",
  };

  const succeeded: ToolCall = {
    name: "ppal-create-clip",
    args: { slot: "3/0" },
    result: '{id:"84",slot:"3/0",noteCount:8}',
  };

  it("skips a failed first attempt for the retry that worked", () => {
    const turns = [turn(errored, succeeded)];

    expect(lastSuccessfulToolCall(turns, 0, "ppal-create-clip")).toBe(
      succeeded,
    );
  });

  it("takes the most recent success when several calls worked", () => {
    const first: ToolCall = { ...succeeded, result: '{id:"1"}' };
    const turns = [turn(first, succeeded)];

    expect(lastSuccessfulToolCall(turns, 0, "ppal-create-clip")).toBe(
      succeeded,
    );
  });

  it("ignores calls to other tools", () => {
    const other: ToolCall = {
      name: "ppal-update-clip",
      args: {},
      result: '{id:"99"}',
    };
    const turns = [turn(succeeded, other)];

    expect(lastSuccessfulToolCall(turns, 0, "ppal-create-clip")).toBe(
      succeeded,
    );
  });

  it("falls back to the last call when every attempt failed", () => {
    const turns = [turn(errored, errored)];

    expect(lastSuccessfulToolCall(turns, 0, "ppal-create-clip")).toBe(errored);
  });

  it("returns undefined when the tool was never called", () => {
    expect(
      lastSuccessfulToolCall([turn()], 0, "ppal-create-clip"),
    ).toBeUndefined();
  });
});

describe("tool call filtering", () => {
  const ok: ToolCall = {
    name: "ppal-create-clip",
    args: {},
    result: '{"id":1}',
  };
  const failed: ToolCall = {
    name: "ppal-create-clip",
    args: {},
    result: "Error: bad notes",
  };
  const turns: EvalTurnResult[] = [
    {
      turnIndex: 0,
      userMessage: "make a clip",
      assistantResponse: "done",
      toolCalls: [failed, ok],
      durationMs: 1,
    },
  ];

  it("flags a call whose result is an error", () => {
    expect(toolCallFailed(failed)).toBe(true);
    expect(toolCallFailed(ok)).toBe(false);
  });

  it("trusts the MCP isError flag over the result's shape", () => {
    // Both directions the flag exists to fix: unparseable prose the server
    // called a success, and a clean payload the server called an error.
    expect(toolCallFailed({ ...failed, isError: false })).toBe(false);
    expect(toolCallFailed({ ...ok, isError: true })).toBe(true);
  });

  it("getToolCalls drops the failed attempt", () => {
    expect(getToolCalls(turns)).toStrictEqual([ok]);
  });

  it("getAllToolCalls keeps every attempt", () => {
    expect(getAllToolCalls(turns)).toStrictEqual([failed, ok]);
  });
});
