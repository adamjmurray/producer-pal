// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  automationDisplayValuesDeviceParam,
  automationDisplayValuesMixer,
  displayedValues,
} from "./automation-display-values.ts";
import { type EvalScenario } from "../../../types.ts";

/**
 * Run a scenario's read-back check on a clip with these envelopes.
 * @param scenario - The scenario
 * @param envelopes - What the clip read reports
 * @returns Whether it passed, and why not
 */
function grade(
  scenario: EvalScenario,
  envelopes: object[],
): { passed: boolean; why: string } {
  const check = scenario.assertions.find(
    (assertion) => assertion.type === "state",
  );

  if (check?.type !== "state" || typeof check.expect !== "function") {
    throw new Error("no state assertion with a matcher");
  }

  return {
    passed: check.expect({ envelopes }),
    why: check.explain?.({ envelopes }) ?? "",
  };
}

const VOLUME = {
  parameter: "Track Volume",
  events: "1|1 0.25 (-24.0 dB) / 3|1 0.7 (-6.0 dB)",
};
const SEND = {
  parameter: "A-Reverb",
  events: "1|1 0.4 (-30.0 dB) / 3|1 0.7 (-12.0 dB)",
};

describe("displayedValues", () => {
  it("reads each point's display, or its raw value when it has none", () => {
    expect(
      displayedValues("1|1 0.25 (-24.0 dB) / 2|1 0.5 _ 3|1 0 (-inf dB)"),
    ).toStrictEqual([-24, 0.5, Number.NaN]);
    expect(displayedValues(undefined)).toStrictEqual([]);
  });
});

describe("automation-display-values-mixer", () => {
  it("accepts ends that display what was asked for", () => {
    expect(grade(automationDisplayValuesMixer, [VOLUME, SEND])).toStrictEqual({
      passed: true,
      why: "",
    });
  });

  it("rejects a guessed raw value, a missing envelope and an extra one", () => {
    const guessed = { ...VOLUME, events: "1|1 0.4 (-18.2 dB) / 3|1 0.8" };

    expect(grade(automationDisplayValuesMixer, [guessed, SEND]).why).toContain(
      "volume should run from -24 dB to -6 dB",
    );
    expect(grade(automationDisplayValuesMixer, [VOLUME]).why).toContain(
      "expected one send A envelope, got 0",
    );
    expect(
      grade(automationDisplayValuesMixer, [
        VOLUME,
        { parameter: "Track Volume" },
      ]).why,
    ).toContain("expected one volume envelope, got 2");
  });
});

describe("automation-display-values-device-param", () => {
  const gain = {
    parameter: "Output",
    device: "t3/d3",
    events: "1|1 0.33 (-12.0 dB) / 3|1 0.5 (0.0 dB)",
  };

  it("accepts the Gain rising between the two values", () => {
    expect(grade(automationDisplayValuesDeviceParam, [gain])).toStrictEqual({
      passed: true,
      why: "",
    });
  });

  it("rejects another parameter, a mixer envelope and wrong ends", () => {
    expect(
      grade(automationDisplayValuesDeviceParam, [
        { ...gain, parameter: "Width" },
      ]).why,
    ).toContain("expected a Gain on a Lead device");
    expect(grade(automationDisplayValuesDeviceParam, [VOLUME]).why).toContain(
      "expected one device envelope",
    );
    expect(
      grade(automationDisplayValuesDeviceParam, [
        { parameter: "Gain", events: "1|1 0.1 (-28.0 dB) / 3|1 0.5 (0.0 dB)" },
        VOLUME,
      ]).why,
    ).toContain("expected one device envelope");
    expect(
      grade(automationDisplayValuesDeviceParam, [
        { ...gain, events: "1|1 0.1 (-28.0 dB) / 3|1 0.5 (0.0 dB)" },
      ]).why,
    ).toContain("Gain should run from -12 dB to 0 dB");
  });
});
