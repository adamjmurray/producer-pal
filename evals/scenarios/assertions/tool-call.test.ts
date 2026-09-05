// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { assertToolCalled } from "./tool-call.ts";
import { type EvalTurnResult, type ToolCallAssertion } from "../types.ts";

type ToolCall = {
  name: string;
  args: Record<string, unknown>;
  result?: string;
};

/** A call that succeeded — grading only counts calls that returned a payload. */
const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  name,
  args,
  result: "{}",
});

/** A call that came back as a tool error. */
const failedCall = (
  name: string,
  args: Record<string, unknown> = {},
): ToolCall => ({
  name,
  args,
  result: "Error: nope",
});

const createTurn = (toolCalls: ToolCall[], turnIndex = 0): EvalTurnResult => ({
  turnIndex,
  userMessage: "test message",
  assistantResponse: "test response",
  toolCalls,
  durationMs: 100,
});

/** Score an assertion against one turn per tool-call list, indexed in order. */
const score = (
  assertion: Omit<ToolCallAssertion, "type">,
  ...turns: ToolCall[][]
) =>
  assertToolCalled(
    { type: "tool_called", ...assertion },
    turns.map(createTurn),
  );

describe("assertToolCalled", () => {
  describe("basic tool matching", () => {
    it("passes when tool is called", () => {
      const result = score({ tool: "read-track" }, [
        call("read-track", { id: "1" }),
      ]);

      expect(result.earned).toBe(1);
      expect(result.maxScore).toBe(1);
      expect(result.message).toContain("read-track called 1 time(s)");
    });

    it("fails when tool is not called", () => {
      const result = score({ tool: "read-track" }, [call("other-tool")]);

      expect(result.earned).toBe(0);
      expect(result.message).toContain("Expected read-track");
      expect(result.message).toContain("got 0");
    });

    it("passes with empty turns when count is 0", () => {
      const result = score({ tool: "read-track", count: 0 });

      expect(result.earned).toBe(result.maxScore);
    });
  });

  describe("args matching", () => {
    it("passes when args exactly match", () => {
      const result = score({ tool: "update-clip", args: { name: "Kick" } }, [
        call("update-clip", { name: "Kick" }),
      ]);

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when actual has extra keys (exact match)", () => {
      const result = score({ tool: "update-clip", args: { name: "Kick" } }, [
        call("update-clip", { id: "1", name: "Kick", length: 4 }),
      ]);

      expect(result.earned).toBe(0);
    });

    it("passes with expect.objectContaining() for partial match", () => {
      const result = score(
        {
          tool: "update-clip",
          args: expect.objectContaining({ name: "Kick" }) as Record<
            string,
            unknown
          >,
        },
        [call("update-clip", { id: "1", name: "Kick", length: 4 })],
      );

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when args do not match", () => {
      const result = score({ tool: "update-clip", args: { name: "Kick" } }, [
        call("update-clip", { name: "Snare" }),
      ]);

      expect(result.earned).toBe(0);
    });
  });

  describe("count matching", () => {
    it("passes when exact count matches", () => {
      const result = score({ tool: "read-track", count: 2 }, [
        call("read-track"),
        call("read-track"),
      ]);

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when count is less than expected", () => {
      const result = score({ tool: "read-track", count: 2 }, [
        call("read-track"),
      ]);

      expect(result.earned).toBe(0);
      expect(result.message).toContain("exactly 2 time(s)");
    });

    it("passes when count is within range", () => {
      const result = score({ tool: "read-track", count: { min: 2, max: 5 } }, [
        call("read-track"),
        call("read-track"),
        call("read-track"),
      ]);

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when count exceeds max", () => {
      const result = score({ tool: "read-track", count: { max: 2 } }, [
        call("read-track"),
        call("read-track"),
        call("read-track"),
      ]);

      expect(result.earned).toBe(0);
    });
  });

  describe("turn filtering", () => {
    it("checks specific turn when turn is specified", () => {
      const result = score(
        { tool: "tool-b", turn: 1 },
        [call("tool-a")],
        [call("tool-b")],
      );

      expect(result.earned).toBe(result.maxScore);
    });

    it("fails when tool not in specified turn", () => {
      const result = score(
        { tool: "tool-a", turn: 1 },
        [call("tool-a")],
        [call("tool-b")],
      );

      expect(result.earned).toBe(0);
    });

    it("checks all turns when turn is 'any'", () => {
      const result = score(
        { tool: "tool-b", turn: "any" },
        [call("tool-a")],
        [call("tool-b")],
      );

      expect(result.earned).toBe(result.maxScore);
    });

    it("handles out-of-range turn index gracefully", () => {
      const result = score({ tool: "tool-a", turn: 5 }, [call("tool-a")]);

      expect(result.earned).toBe(0);
    });
  });

  describe("result details", () => {
    it("includes matching calls in details", () => {
      const result = score({ tool: "read-track" }, [
        call("read-track", { id: "1" }),
        call("read-track", { id: "2" }),
      ]);
      const details = result.details as {
        matchingCalls: unknown[];
        count: number;
      };

      expect(details.matchingCalls).toHaveLength(2);
      expect(details.count).toBe(2);
    });

    it("renders objectContaining matchers readably in failure message", () => {
      const result = score(
        {
          tool: "update-clip",
          args: expect.objectContaining({
            ids: expect.any(String),
            transforms: expect.stringMatching(/Ab1/),
          }) as Record<string, unknown>,
        },
        [call("update-clip", { ids: "17", transforms: "wrong" })],
      );

      expect(result.earned).toBe(0);
      expect(result.message).toContain("ids: Any<String>");
      expect(result.message).toContain("StringMatching</Ab1/>");
      expect(result.message).not.toContain('"ObjectContaining"');
    });
  });

  describe("failed calls", () => {
    it("ignores a failed call the model then corrected", () => {
      const result = score({ tool: "create-clip", count: 1 }, [
        failedCall("create-clip", { notes: "bogus" }),
        call("create-clip", { notes: "C3" }),
      ]);

      expect(result.earned).toBe(1);
      expect(result.message).toContain("called 1 time(s)");
    });

    it("fails when every call errored", () => {
      const result = score({ tool: "create-clip" }, [
        failedCall("create-clip"),
      ]);

      expect(result.earned).toBe(0);
      expect(result.message).toContain("got 0");
    });
  });
});
