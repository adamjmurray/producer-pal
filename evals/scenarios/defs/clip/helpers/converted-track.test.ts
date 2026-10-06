// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type EvalTurnResult, type ToolCall } from "../../../types.ts";
import { convertedTrackPath } from "./converted-track.ts";

const turnWith = (toolCalls: ToolCall[]): EvalTurnResult[] => [
  {
    turnIndex: 0,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls,
    durationMs: 1,
  },
];

const convert = (result: string, isError?: boolean): ToolCall => ({
  name: "ppal-update-clip",
  args: { path: "t5/s0", convert: "drums" },
  result,
  ...(isError != null && { isError }),
});

describe("convertedTrackPath", () => {
  it("reads the track a conversion reported", () => {
    const call = convert(
      '{"path":"t6/s0","converted":{"track":{"id":"9","path":"t7"}}}',
    );

    expect(convertedTrackPath(turnWith([call]))).toBe("t7");
  });

  it("reads one entry of a list", () => {
    const call = convert(
      '[{"path":"t5/s0","converted":{"track":{"id":"9","path":"t6"}}}]',
    );

    expect(convertedTrackPath(turnWith([call]))).toBe("t6");
  });

  it("takes the last conversion", () => {
    const first = convert('{"converted":{"track":{"id":"9","path":"t6"}}}');
    const second = convert('{"converted":{"track":{"id":"10","path":"t8"}}}');

    expect(convertedTrackPath(turnWith([first, second]))).toBe("t8");
  });

  it("skips a failed call and a call that converted nothing", () => {
    const failed = convert("Error: only an audio clip can be converted", true);
    const plain: ToolCall = {
      name: "ppal-update-clip",
      args: { path: "t0/s0", name: "x" },
      result: '{"path":"t0/s0"}',
    };

    expect(convertedTrackPath(turnWith([failed, plain]))).toBe("t6");
  });
});
