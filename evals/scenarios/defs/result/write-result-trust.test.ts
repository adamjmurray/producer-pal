// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalTurnResult,
  type ToolCall,
} from "../../types.ts";
import { writeTrustSilentResult } from "./write-result-trust.ts";

const grader = writeTrustSilentResult.assertions.find(
  (a) => a.type === "custom",
) as CustomAssertion;

const WRITE: ToolCall = {
  name: "ppal-update-track",
  args: { trackIndex: 1, name: "Sub Bass" },
  result: '{id:"2",path:"t1"}',
};

const turnWith = (toolCalls: ToolCall[]): EvalTurnResult[] => [
  {
    turnIndex: 0,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: [],
    durationMs: 1,
  },
  {
    turnIndex: 1,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls,
    durationMs: 1,
  },
];

describe("write-trust-silent-result assertNoReadBack", () => {
  it("passes when nothing is read after the write", () => {
    const earlyRead: ToolCall = {
      name: "ppal-read-track",
      args: { trackIndex: 1 },
      result: '{id:"2"}',
    };

    expect(grader.assert(turnWith([earlyRead, WRITE]))).toBe(true);
  });

  it("fails on a successful read after the write", () => {
    const read: ToolCall = {
      name: "ppal-read-track",
      args: { trackIndex: 1 },
      result: '{id:"2",name:"Sub Bass"}',
    };

    expect(() => grader.assert(turnWith([WRITE, read]))).toThrow(
      /1 read\(s\) after the write/,
    );
  });

  it("fails on a failed read after the write", () => {
    const failedRead: ToolCall = {
      name: "ppal-read-track",
      args: { trackIndex: 9 },
      result: "Error: no such track",
      isError: true,
    };

    expect(() => grader.assert(turnWith([WRITE, failedRead]))).toThrow(
      /1 read\(s\) after the write/,
    );
  });

  it("does not count a read that follows only a failed write", () => {
    const failedWrite: ToolCall = {
      ...WRITE,
      result: "Error: bad args",
      isError: true,
    };
    const read: ToolCall = {
      name: "ppal-read-track",
      args: {},
      result: '{id:"2"}',
    };

    expect(() => grader.assert(turnWith([failedWrite, read]))).toThrow(
      /no successful ppal-update-track call/,
    );
  });
});
