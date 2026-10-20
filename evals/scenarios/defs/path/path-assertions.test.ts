// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type CustomAssertion, type EvalTurnResult } from "../../types.ts";
import { assertPathArg } from "./path-assertions.ts";

const read = (path: string): EvalTurnResult[] => [
  {
    turnIndex: 0,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: [
      { name: "ppal-read-track", args: { path }, result: '{id:"1"}' },
    ],
    durationMs: 1,
  },
];

const grade = (path: string, allowList?: boolean): unknown =>
  (
    assertPathArg({
      turn: 0,
      tool: "ppal-read-track",
      param: "path",
      expected: "rt1",
      allowList,
    }) as CustomAssertion
  ).assert(read(path));

describe("assertPathArg", () => {
  it("accepts the expected path", () => {
    expect(grade("rt1")).toBe(true);
  });

  it("rejects a path list unless the list is allowed", () => {
    expect(() => grade("rt0,rt1")).toThrow("got 'rt0,rt1'");
  });

  it("accepts a list that contains the expected path", () => {
    expect(grade("rt0, rt1", true)).toBe(true);
    expect(grade("rt1", true)).toBe(true);
  });

  it("rejects a list that does not contain it", () => {
    expect(() => grade("rt0,rt2", true)).toThrow("alone or in a list");
  });
});
