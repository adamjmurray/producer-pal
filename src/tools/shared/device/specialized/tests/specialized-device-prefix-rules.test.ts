// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  applyInactiveStates,
  prefixModes,
  ruleMarksInactive,
} from "../specialized-device-inactive.ts";

// A controller whose value picks one family of params sharing a name prefix
// (Drum Synth's sound types and models).

const RULE = prefixModes("Type", { Kick: "Kick", Snare: "Snare", None: null });

/**
 * The params a read lists, with the controller at a value.
 * @param type - The controller's value
 * @returns Parameter entries
 */
function listed(type: string): Record<string, unknown>[] {
  return [
    { name: "Type", value: type },
    { name: "Kick Click", value: 1 },
    { name: "Kick Model", value: "80x" },
    { name: "Snare Tone", value: 1 },
    { name: "Kickback", value: 1 },
    { name: "Volume", value: 1 },
  ];
}

/**
 * The names a rule marked inactive.
 * @param params - Entries after the rule ran
 * @returns Their names
 */
function inactive(params: Record<string, unknown>[]): unknown[] {
  return params.filter((p) => p.state === "inactive").map((p) => p.name);
}

describe("prefixModes", () => {
  it("marks every other family's params inactive", () => {
    const params = listed("Kick");

    applyInactiveStates([RULE], params);

    expect(inactive(params)).toStrictEqual(["Snare Tone"]);
  });

  it("matches a prefix as a whole word and leaves other params alone", () => {
    const params = listed("Snare");

    applyInactiveStates([RULE], params);

    expect(inactive(params)).toStrictEqual(["Kick Click", "Kick Model"]);
  });

  it("marks every family when the value has no prefix", () => {
    const params = listed("None");

    applyInactiveStates([RULE], params);

    expect(inactive(params)).toStrictEqual([
      "Kick Click",
      "Kick Model",
      "Snare Tone",
    ]);
  });

  it("marks every family for a value the rule doesn't list", () => {
    const params = listed("Clap");

    applyInactiveStates([RULE], params);

    expect(inactive(params)).toStrictEqual([
      "Kick Click",
      "Kick Model",
      "Snare Tone",
    ]);
  });

  it("does nothing when the controller reads no value", () => {
    const params = listed("Kick").slice(1);

    applyInactiveStates([RULE], params, () => undefined);

    expect(inactive(params)).toStrictEqual([]);
  });

  it("reads a controller a param search left out", () => {
    const params = listed("Kick").slice(1);

    applyInactiveStates([RULE], params, () => "Snare");

    expect(inactive(params)).toStrictEqual(["Kick Click", "Kick Model"]);
  });

  it("never overrides a state Live already set", () => {
    const params = listed("Snare");

    (params[1] as Record<string, unknown>).state = "disabled";
    applyInactiveStates([RULE], params);

    expect(params[1]?.state).toBe("disabled");
  });

  it("answers a write check from the param name alone", () => {
    const read = () => "Kick";

    expect(ruleMarksInactive([RULE], "Snare Tone", read)).toBe(true);
    expect(ruleMarksInactive([RULE], "Kick Click", read)).toBe(false);
    expect(ruleMarksInactive([RULE], "Volume", read)).toBe(false);
  });
});

describe("a rule on params that share a name", () => {
  it("marks every param carrying the name", () => {
    const params = [
      { name: "S/C On", value: "Off" },
      { name: "S/C Gain", value: 0 },
      { name: "S/C Gain", value: 1 },
      { name: "Gain", value: 0 },
    ];

    applyInactiveStates(
      [{ controller: "S/C On", cases: { Off: ["S/C Gain"] } }],
      params,
    );

    expect(params.map((p) => "state" in p)).toStrictEqual([
      false,
      true,
      true,
      false,
    ]);
  });
});
