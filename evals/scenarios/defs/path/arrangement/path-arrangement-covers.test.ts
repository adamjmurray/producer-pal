// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalTurnResult,
  type ToolCall,
} from "../../../types.ts";
import { pathArrangementCovers } from "./path-arrangement-covers.ts";

const grader = pathArrangementCovers.assertions.find(
  (a) => a.type === "custom",
) as CustomAssertion;

const rename = (path: string): ToolCall => ({
  name: "ppal-update-clip",
  args: { path, name: "Long One" },
  result: '{id:"7",path:"t3[1|1]"}',
});

const renameById = (id: string): ToolCall => ({
  name: "ppal-update-clip",
  args: { ids: id, name: "Long One" },
  result: '{id:"7",path:"t3[1|1]"}',
});

const readClip = (path: string): ToolCall => ({
  name: "ppal-read-clip",
  args: { path },
  result: '{id:"7",path:"t3[1|1]",name:"Clip"}',
});

const readTrack: ToolCall = {
  name: "ppal-read-track",
  args: { path: "t3", include: ["arrangement-clips"] },
  result: '{id:"3"}',
};

const turnsWith = (toolCalls: ToolCall[]): EvalTurnResult[] =>
  [0, 1, 2].map((turnIndex) => ({
    turnIndex,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: turnIndex === 2 ? toolCalls : [],
    durationMs: 1,
  }));

const grade = (toolCalls: ToolCall[]): boolean | Promise<boolean> =>
  grader.assert(turnsWith(toolCalls)) as boolean | Promise<boolean>;

describe("path-arrangement-covers assertTrustsCoveringBar", () => {
  it("passes on one write aimed at the covered bar", () => {
    expect(grade([rename("t3[3|1]")])).toBe(true);
    expect(grade([rename("t3[ 3|2.5 ]")])).toBe(true);
  });

  it("passes on a read at the covered bar, then a rename by path", () => {
    expect(grade([readClip("t3[3|1]"), rename("t3[3|1]")])).toBe(true);
  });

  it("passes on a read at the covered bar, then a rename by the id it returned", () => {
    expect(grade([readClip("t3[3|1]"), renameById("7")])).toBe(true);
  });

  it("ignores reads before a correct write", () => {
    expect(grade([readTrack, rename("t3[3|1]")])).toBe(true);
    expect(grade([readClip("t3[1|1]"), rename("t3[3|1]")])).toBe(true);
  });

  it("fails on a path at another bar of track 3", () => {
    expect(() => grade([rename("t3[1|1]")])).toThrow(
      /path 't3\[1\|1\]' is not a bar-3 coordinate/,
    );
  });

  it("fails on a second write attempt", () => {
    expect(() => grade([rename("t3[3|1]"), rename("t3[3|1]")])).toThrow(
      /2 ppal-update-clip calls/,
    );
  });

  it("fails on no write at all", () => {
    expect(() => grade([readClip("t3[3|1]")])).toThrow(
      /0 ppal-update-clip calls/,
    );
  });

  it("fails when the path is on another track", () => {
    expect(() => grade([rename("t2[3|1]")])).toThrow(
      /not a bar-3 coordinate on track 3/,
    );
  });

  it("fails when the id did not come from a bar-3 read", () => {
    expect(() => grade([renameById("7")])).toThrow(
      /neither a bar-3 path nor the id of a ppal-read-clip/,
    );
    expect(() => grade([readClip("t3[3|1]"), renameById("9")])).toThrow(
      /ids read: 7/,
    );
    expect(() => grade([readClip("t3[1|1]"), renameById("7")])).toThrow(
      /ids read: none/,
    );
  });
});
