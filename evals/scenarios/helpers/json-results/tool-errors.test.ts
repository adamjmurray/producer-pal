// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for tool-errors.ts
 */

import { describe, it, expect } from "vitest";
import { type EvalTurnResult, type ToolCall } from "../../types.ts";
import { collectToolErrors } from "./tool-errors.ts";

/**
 * Build a turn holding the given tool calls.
 *
 * @param turnIndex - Turn index
 * @param toolCalls - The turn's tool calls
 * @returns A turn result
 */
function makeTurn(turnIndex: number, toolCalls: ToolCall[]): EvalTurnResult {
  return {
    turnIndex,
    userMessage: "go",
    assistantResponse: "ok",
    toolCalls,
    durationMs: 1,
  };
}

describe("collectToolErrors", () => {
  it("returns undefined when no tool was called", () => {
    expect(collectToolErrors([makeTurn(0, [])])).toBeUndefined();
  });

  it("reports zero errors for a clean run", () => {
    const turns = [
      makeTurn(0, [{ name: "ppal-connect", args: {}, result: "{}" }]),
    ];

    expect(collectToolErrors(turns)).toStrictEqual({
      count: 0,
      total: 1,
      errors: [],
    });
  });

  it("records each failed call with its turn and message", () => {
    const turns = [
      makeTurn(0, [{ name: "ppal-connect", args: {}, result: "{}" }]),
      makeTurn(1, [
        {
          name: "ppal-create-clip",
          args: {},
          result: "Error: bad notes",
        },
        { name: "ppal-create-clip", args: {}, result: '{"id":1}' },
      ]),
    ];

    expect(collectToolErrors(turns)).toStrictEqual({
      count: 1,
      total: 3,
      errors: [
        {
          turnIndex: 1,
          name: "ppal-create-clip",
          message: "Error: bad notes",
        },
      ],
    });
  });

  it("truncates a long error message", () => {
    const turns = [
      makeTurn(0, [
        { name: "ppal-x", args: {}, result: "Error: " + "x".repeat(500) },
      ]),
    ];

    expect(collectToolErrors(turns)?.errors[0]?.message).toHaveLength(200);
  });
});
