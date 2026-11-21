// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { TOOLS } from "#evals/shared/tool-names.ts";
import { type EvalAssertion, type EvalTurnResult } from "../../../types.ts";
import {
  assertMemoryDeleted,
  assertMemoryRead,
  assertNoMemoryRead,
} from "./memory-assertions.ts";

/**
 * One turn holding one ppal-context call that returned a payload.
 * @param args - The call's args
 * @returns The turn
 */
function turnWith(args: Record<string, unknown>): EvalTurnResult[] {
  return [
    {
      turnIndex: 0,
      userMessage: "m",
      assistantResponse: "r",
      toolCalls: [{ name: TOOLS.context, args, result: "{}" }],
      durationMs: 1,
    },
  ];
}

/**
 * Run an assertion against turns.
 * @param assertion - The assertion
 * @param turns - The turns
 * @returns Whether it passed
 */
function passes(assertion: EvalAssertion, turns: EvalTurnResult[]): boolean {
  if (assertion.type !== "custom") {
    throw new Error("expected a custom assertion");
  }

  try {
    return assertion.assert(turns);
  } catch {
    return false;
  }
}

describe("memory assertions with a name list", () => {
  const read = (name: string): Record<string, unknown> => ({
    action: "read",
    scope: "memory",
    name,
  });
  const del = (name: string): Record<string, unknown> => ({
    action: "delete",
    scope: "memory",
    name,
  });

  it("passes a read of one name among several", () => {
    expect(passes(assertMemoryRead("b", "any"), turnWith(read("a, b")))).toBe(
      true,
    );
  });

  it("passes a read of a single name", () => {
    expect(passes(assertMemoryRead("a", "any"), turnWith(read("a")))).toBe(
      true,
    );
  });

  it("fails a read that never names it", () => {
    expect(passes(assertMemoryRead("c", "any"), turnWith(read("a,b")))).toBe(
      false,
    );
  });

  it("keeps an escaped comma inside one name", () => {
    expect(
      passes(assertMemoryRead("a,b", "any"), turnWith(read("a\\,b,c"))),
    ).toBe(true);
    expect(
      passes(assertMemoryRead("a", "any"), turnWith(read("a\\,b,c"))),
    ).toBe(false);
  });

  it("passes a delete of one name among several", () => {
    expect(passes(assertMemoryDeleted("b", "any"), turnWith(del("a,b")))).toBe(
      true,
    );
    expect(passes(assertMemoryDeleted("c", "any"), turnWith(del("a,b")))).toBe(
      false,
    );
  });

  it("counts every listed name as a body loaded", () => {
    expect(passes(assertNoMemoryRead("any"), turnWith(read("a,b")))).toBe(
      false,
    );
    expect(
      passes(
        assertNoMemoryRead("any"),
        turnWith({ action: "read", scope: "memory" }),
      ),
    ).toBe(true);
  });
});
