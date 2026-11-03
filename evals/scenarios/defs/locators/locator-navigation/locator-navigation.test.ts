// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalTurnResult,
  type StateAssertion,
} from "../../../types.ts";
import { locatorNavigation } from "./locator-navigation.ts";

const loopRead = locatorNavigation.assertions.find(
  (a) => a.type === "state" && a.tool === "ppal-playback",
) as StateAssertion | undefined;

const startGrader = locatorNavigation.assertions.find(
  (a) => a.type === "custom" && a.description.includes("chorus"),
) as CustomAssertion;

const startTurn = (
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): EvalTurnResult[] =>
  Array.from({ length: 5 }, (_, i) => ({
    turnIndex: i,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls:
      i === 1
        ? [{ name: "ppal-playback", args, result: JSON.stringify(result) }]
        : [],
    durationMs: 1,
  }));

describe("locatorNavigation loop turn", () => {
  it("reads the loop back from Live instead of trusting the args", () => {
    expect(loopRead).toBeDefined();
    expect(loopRead?.args).toStrictEqual({ action: "play-arrangement" });
  });

  it("passes when the loop landed on Bridge to Outro", () => {
    const expected = loopRead?.expect as (result: unknown) => boolean;

    expect(
      expected({
        playing: true,
        loop: true,
        loopStart: "25|1",
        loopEnd: "33|1",
      }),
    ).toBe(true);
  });

  it.each([
    ["the wrong locators", { loop: true, loopStart: "9|1", loopEnd: "17|1" }],
    ["the loop off", { loop: false }],
  ])("fails with %s", (_label, result) => {
    const expected = loopRead?.expect as (result: unknown) => boolean;

    expect(expected({ playing: true, ...result })).toBe(false);
  });
});

describe("locatorNavigation start turn", () => {
  it.each([
    ["a computed correct position", "17|1", "17|1"],
    ["a loc: naming the chorus", "loc:Chorus", "17|1"],
  ])("passes with %s", (_label, startTime, landed) => {
    expect(
      startGrader.assert(
        startTurn(
          { action: "play-arrangement", startTime },
          { startTime: landed },
        ),
      ),
    ).toBe(true);
  });

  it.each([
    ["a computed wrong position", "25|1", "25|1"],
    ["a loc: naming the wrong locator", "loc:Bridge", "25|1"],
  ])("fails with %s", (_label, startTime, landed) => {
    expect(() =>
      startGrader.assert(
        startTurn(
          { action: "play-arrangement", startTime },
          { startTime: landed },
        ),
      ),
    ).toThrow("expected the chorus (17|1)");
  });
});
