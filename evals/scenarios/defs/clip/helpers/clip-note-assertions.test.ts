// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type EvalTurnResult, type ToolCall } from "../../../types.ts";
import { assertNotesRead } from "./clip-note-assertions.ts";

const turn = (...toolCalls: ToolCall[]): EvalTurnResult[] => [
  {
    turnIndex: 0,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls,
    durationMs: 1,
  },
];

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  name,
  args,
  result: "{}",
});

const readNotes = call("ppal-read-clip", { include: ["notes"] });

function run(turns: EvalTurnResult[]): unknown {
  const assertion = assertNotesRead(0);

  if (assertion.type !== "custom") {
    throw new Error("expected a custom assertion");
  }

  return assertion.assert(turns);
}

describe("assertNotesRead", () => {
  it("passes when the notes were read", () => {
    expect(run(turn(readNotes))).toBe(true);
  });

  it("accepts the wildcard include", () => {
    expect(run(turn(call("ppal-read-clip", { include: ["*"] })))).toBe(true);
  });

  it("ignores a read of the project context", () => {
    const context = call("ppal-context", { action: "read", scope: "project" });

    expect(run(turn(context, readNotes))).toBe(true);
  });

  it("fails on a context write", () => {
    const write = call("ppal-context", { action: "write", scope: "project" });

    expect(() => run(turn(write, readNotes))).toThrow(/non-read tool call/);
  });

  it("fails on a write tool", () => {
    expect(() => run(turn(call("ppal-update-clip"), readNotes))).toThrow(
      /non-read tool call/,
    );
  });

  it("fails when no read pulled in notes", () => {
    expect(() => run(turn(call("ppal-read-clip")))).toThrow(/notes/);
  });
});
