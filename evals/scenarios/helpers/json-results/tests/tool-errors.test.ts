// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Tests for tool-errors.ts
 */

import { describe, it, expect } from "vitest";
import { type EvalTurnResult, type ToolCall } from "../../../types.ts";
import { collectToolErrors } from "../tool-errors.ts";

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

  it("ignores failures of tools that are not Producer Pal's", () => {
    const turns = [
      makeTurn(0, [
        {
          name: "list_mcp_resources",
          args: {},
          result: "Error: unknown MCP server 'producer_pal'",
        },
        { name: "ppal-connect", args: {}, result: "{}" },
      ]),
    ];

    expect(collectToolErrors(turns)).toStrictEqual({
      count: 0,
      total: 1,
      errors: [],
    });
  });

  it("returns undefined when only other tools were called", () => {
    const turns = [
      makeTurn(0, [{ name: "list_mcp_resources", args: {}, result: "Error" }]),
    ];

    expect(collectToolErrors(turns)).toBeUndefined();
  });

  describe("expected refusals", () => {
    const refusal = "Error: path names 2 entries but name names 4 entries";
    const turns = [
      makeTurn(0, [
        { name: "ppal-update-track", args: {}, result: refusal },
        { name: "ppal-read-track", args: {}, result: "Error: id or path" },
      ]),
    ];

    it("leaves a matching refusal out of the count", () => {
      const tally = collectToolErrors(turns, [
        { tool: "ppal-update-track", message: /names \d+ entries but/ },
      ]);

      expect(tally).toStrictEqual({
        count: 1,
        total: 2,
        errors: [
          {
            turnIndex: 0,
            name: "ppal-read-track",
            message: "Error: id or path",
          },
        ],
      });
    });

    it("matches a string by substring", () => {
      const tally = collectToolErrors(turns, [
        { tool: "ppal-update-track", message: "names 2 entries" },
      ]);

      expect(tally?.count).toBe(1);
    });

    it("still counts an unexpected error from the same tool", () => {
      const other = [
        makeTurn(0, [
          { name: "ppal-update-track", args: {}, result: refusal },
          { name: "ppal-update-track", args: {}, result: "Error: no track" },
        ]),
      ];
      const tally = collectToolErrors(other, [
        { tool: "ppal-update-track", message: /names \d+ entries but/ },
      ]);

      expect(tally?.errors.map((e) => e.message)).toStrictEqual([
        "Error: no track",
      ]);
    });

    it("still counts the right tool with the wrong text", () => {
      const tally = collectToolErrors(turns, [
        { tool: "ppal-update-track", message: "tempo range" },
      ]);

      expect(tally?.count).toBe(2);
    });

    it("still counts the right text from another tool", () => {
      const tally = collectToolErrors(turns, [
        { tool: "ppal-update-scene", message: /names \d+ entries but/ },
      ]);

      expect(tally?.count).toBe(2);
    });
  });
});
