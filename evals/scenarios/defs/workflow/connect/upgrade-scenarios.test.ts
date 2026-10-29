// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalScenario,
  type EvalTurnResult,
  type ToolCall,
} from "../../../types.ts";
import { upgradeDeviceVersionCheck } from "./upgrade-device-version-check.ts";
import { upgradeFirstMessageFullConnect } from "./upgrade-first-message-full-connect.ts";
import { upgradeRemoteScriptRestartCheck } from "./upgrade-remote-script-restart-check.ts";

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  name,
  args,
  result: "{}",
});
const CONNECT = call("ppal-connect");
const CHECK = call("ppal-connect", { versionCheck: true });
const UPDATE = call("ppal-manage", { action: "update-producer-pal" });
const INSTALL = call("ppal-manage", { action: "install-producer-pal" });

const turn = (index: number, toolCalls: ToolCall[]): EvalTurnResult => ({
  turnIndex: index,
  userMessage: "u",
  assistantResponse: "a",
  toolCalls,
  durationMs: 1,
});

/**
 * @param scenario - The scenario to grade
 * @param turns - The turns to grade
 * @returns Each custom check's description and whether it passed
 */
function grade(
  scenario: EvalScenario,
  turns: EvalTurnResult[],
): Record<string, boolean> {
  return Object.fromEntries(
    scenario.assertions
      .filter((a): a is CustomAssertion => a.type === "custom")
      .map((a) => [a.description, a.assert(turns)]),
  );
}

describe("every upgrade scenario", () => {
  it.each([
    upgradeDeviceVersionCheck,
    upgradeFirstMessageFullConnect,
    upgradeRemoteScriptRestartCheck,
  ])("$id overrides tools and needs ppal-manage", (scenario) => {
    expect(Object.keys(scenario.toolOverrides ?? {})).toStrictEqual([
      "ppal-connect",
      "ppal-manage",
    ]);
    expect(scenario.requires?.tools).toStrictEqual(["ppal-manage"]);
    expect(scenario.seedConnect).toBe(false);
  });
});

describe("upgrade-device-version-check", () => {
  const good = [turn(0, [CONNECT]), turn(1, [UPDATE, CHECK])];

  it("passes the intended flow", () => {
    expect(Object.values(grade(upgradeDeviceVersionCheck, good))).toStrictEqual(
      [true, true, true, true],
    );
  });

  it("fails when it updates before asking, or re-connects in full", () => {
    const results = grade(upgradeDeviceVersionCheck, [
      turn(0, [CONNECT, UPDATE]),
      turn(1, [CONNECT]),
    ]);

    expect(results["asks first: no ppal-manage call in turn 0"]).toBe(false);
    expect(results["no full ppal-connect after turn 0"]).toBe(false);
    expect(
      results["turn 1 re-checks with ppal-connect versionCheck: true"],
    ).toBe(false);
  });
});

describe("upgrade-first-message-full-connect", () => {
  const description = "no version-check-only connect before a full connect";
  const run = (calls: ToolCall[]): Record<string, boolean> =>
    grade(upgradeFirstMessageFullConnect, [turn(0, calls)]);

  it("passes update then a full connect", () => {
    expect(Object.values(run([UPDATE, CONNECT]))).toStrictEqual([
      true,
      true,
      true,
    ]);
  });

  it("allows a full connect before the update and a check after", () => {
    expect(Object.values(run([CONNECT, UPDATE, CHECK]))).toStrictEqual([
      true,
      true,
      true,
    ]);
  });

  it("fails a version check with no full connect", () => {
    const results = run([UPDATE, CHECK]);

    expect(results[description]).toBe(false);
    expect(
      results["does a full ppal-connect (the chat has no Skills yet)"],
    ).toBe(false);
  });

  it("fails a version check ahead of the full connect", () => {
    expect(run([UPDATE, CHECK, CONNECT])[description]).toBe(false);
  });
});

describe("upgrade-remote-script-restart-check", () => {
  it("passes the intended flow", () => {
    const turns = [turn(0, [CONNECT]), turn(1, [INSTALL]), turn(2, [CHECK])];

    expect(
      Object.values(grade(upgradeRemoteScriptRestartCheck, turns)),
    ).toStrictEqual([true, true, true, true]);
  });

  it("accepts the install in turn 0, before the user agrees", () => {
    const turns = [turn(0, [CONNECT, INSTALL]), turn(1, []), turn(2, [CHECK])];

    expect(
      Object.values(grade(upgradeRemoteScriptRestartCheck, turns)),
    ).toStrictEqual([true, true, true, true]);
  });

  it("fails when it never installs", () => {
    const results = grade(upgradeRemoteScriptRestartCheck, [
      turn(0, [CONNECT]),
      turn(1, []),
      turn(2, [CHECK]),
    ]);

    expect(
      results[
        "calls ppal-manage install-producer-pal in turn 0 or 1 (the line doesn't say to ask first)"
      ],
    ).toBe(false);
  });

  it("fails an install repeated after the restart, or a full connect", () => {
    const results = grade(upgradeRemoteScriptRestartCheck, [
      turn(0, [CONNECT]),
      turn(1, [INSTALL]),
      turn(2, [INSTALL, CONNECT]),
    ]);

    expect(results["turn 2 does not install again"]).toBe(false);
    expect(results["no full ppal-connect after turn 0"]).toBe(false);
    expect(
      results["turn 2 re-checks with ppal-connect versionCheck: true"],
    ).toBe(false);
  });
});
