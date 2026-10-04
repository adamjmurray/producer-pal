// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

const loopTurnGrader = locatorNavigation.assertions.find(
  (a) => a.type === "custom" && a.description.includes("loopStart"),
) as CustomAssertion;

const loopTurn = (args: Record<string, unknown>): EvalTurnResult[] =>
  Array.from({ length: 5 }, (_, i) => ({
    turnIndex: i,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls:
      i === 2
        ? [{ name: "ppal-playback", args, result: "{playing:true}" }]
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

  it("accepts locator ids, since the loop read grades where they land", () => {
    expect(
      loopTurnGrader.assert(
        loopTurn({ loopStart: "loc:12", loopEnd: "loc:13" }),
      ),
    ).toBe(true);
  });

  it("fails a computed bar position", () => {
    expect(() =>
      loopTurnGrader.assert(
        loopTurn({ loopStart: "25|1", loopEnd: "loc:Outro" }),
      ),
    ).toThrow("did not name a locator: loopStart=25|1");
  });
});
