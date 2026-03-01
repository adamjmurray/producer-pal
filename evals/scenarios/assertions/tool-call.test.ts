// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { assertToolCalled } from "./tool-call.ts";
import { type EvalTurnResult, type ToolCallAssertion } from "../types.ts";

const createTurn = (
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  turnIndex = 0,
): EvalTurnResult => ({
  turnIndex,
  userMessage: "test message",
  assistantResponse: "test response",
  toolCalls,
  durationMs: 100,
});

describe("assertToolCalled", () => {
  describe("basic tool matching", () => {
    it("passes when tool is called", () => {
      const turns = [createTurn([{ name: "read-track", args: { id: "1" } }])];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(1);
      expect(result.maxScore).toBe(1);
      expect(result.message).toContain("read-track called 1 time(s)");
    });

    it("fails when tool is not called", () => {
      const turns = [createTurn([{ name: "other-tool", args: {} }])];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(0);
      expect(result.message).toContain("Expected read-track");
      expect(result.message).toContain("got 0");
    });

    it("passes with empty turns when count is 0", () => {
      const turns: EvalTurnResult[] = [];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
        count: 0,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(result.maxScore);
    });
  });

  describe("args matching", () => {
    it("passes when args exactly match", () => {
      const turns = [
        createTurn([{ name: "update-clip", args: { name: "Kick" } }]),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "update-clip",
        args: { name: "Kick" },
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when actual has extra keys (exact match)", () => {
      const turns = [
        createTurn([
          { name: "update-clip", args: { id: "1", name: "Kick", length: 4 } },
        ]),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "update-clip",
        args: { name: "Kick" },
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(0);
    });

    it("passes with expect.objectContaining() for partial match", () => {
      const turns = [
        createTurn([
          { name: "update-clip", args: { id: "1", name: "Kick", length: 4 } },
        ]),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "update-clip",
        args: expect.objectContaining({ name: "Kick" }) as Record<
          string,
          unknown
        >,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when args do not match", () => {
      const turns = [
        createTurn([{ name: "update-clip", args: { name: "Snare" } }]),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "update-clip",
        args: { name: "Kick" },
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(0);
    });
  });

  describe("count matching", () => {
    it("passes when exact count matches", () => {
      const turns = [
        createTurn([
          { name: "read-track", args: {} },
          { name: "read-track", args: {} },
        ]),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
        count: 2,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when count is less than expected", () => {
      const turns = [createTurn([{ name: "read-track", args: {} }])];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
        count: 2,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(0);
      expect(result.message).toContain("exactly 2 time(s)");
    });

    it("passes when count is within range", () => {
      const turns = [
        createTurn([
          { name: "read-track", args: {} },
          { name: "read-track", args: {} },
          { name: "read-track", args: {} },
        ]),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
        count: { min: 2, max: 5 },
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when count exceeds max", () => {
      const turns = [
        createTurn([
          { name: "read-track", args: {} },
          { name: "read-track", args: {} },
          { name: "read-track", args: {} },
        ]),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
        count: { max: 2 },
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(0);
    });
  });

  describe("turn filtering", () => {
    it("checks specific turn when turn is specified", () => {
      const turns = [
        createTurn([{ name: "tool-a", args: {} }], 0),
        createTurn([{ name: "tool-b", args: {} }], 1),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "tool-b",
        turn: 1,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when tool not in specified turn", () => {
      const turns = [
        createTurn([{ name: "tool-a", args: {} }], 0),
        createTurn([{ name: "tool-b", args: {} }], 1),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "tool-a",
        turn: 1,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(0);
    });

    it("checks all turns when turn is 'any'", () => {
      const turns = [
        createTurn([{ name: "tool-a", args: {} }], 0),
        createTurn([{ name: "tool-b", args: {} }], 1),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "tool-b",
        turn: "any",
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(result.maxScore);
    });

    it("handles out-of-range turn index gracefully", () => {
      const turns = [createTurn([{ name: "tool-a", args: {} }], 0)];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "tool-a",
        turn: 5,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(0);
    });
  });

  describe("custom score", () => {
    it("uses assertion score value", () => {
      const turns = [createTurn([{ name: "read-track", args: {} }])];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
        score: 5,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(5);
      expect(result.maxScore).toBe(5);
    });

    it("returns 0 earned with custom score on failure", () => {
      const turns = [createTurn([{ name: "other-tool", args: {} }])];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
        score: 5,
      };

      const result = assertToolCalled(assertion, turns);

      expect(result.earned).toBe(0);
      expect(result.maxScore).toBe(5);
    });
  });

  describe("result details", () => {
    it("includes matching calls in details", () => {
      const turns = [
        createTurn([
          { name: "read-track", args: { id: "1" } },
          { name: "read-track", args: { id: "2" } },
        ]),
      ];
      const assertion: ToolCallAssertion = {
        type: "tool_called",
        tool: "read-track",
      };

      const result = assertToolCalled(assertion, turns);
      const details = result.details as {
        matchingCalls: unknown[];
        count: number;
      };

      expect(details.matchingCalls).toHaveLength(2);
      expect(details.count).toBe(2);
    });
  });
});
