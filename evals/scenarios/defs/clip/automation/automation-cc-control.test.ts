// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { TOOLS } from "#evals/shared/tool-names.ts";
import { type EvalScenario } from "../../../types.ts";
import {
  automationCcControlModWheel,
  automationCcControlPitchBend,
} from "./automation-cc-control.ts";

/** Run one of a scenario's state checks on a canned read. */
function grade(
  scenario: EvalScenario,
  tool: string,
  result: unknown,
): { passed: boolean; why: string } {
  const check = scenario.assertions.find(
    (assertion) => assertion.type === "state" && assertion.tool === tool,
  );

  if (check?.type !== "state" || typeof check.expect !== "function") {
    throw new Error("no state assertion with a matcher");
  }

  return { passed: check.expect(result), why: check.explain?.(result) ?? "" };
}

/** Grade the Lead clip reading back with one envelope. */
function gradeEnvelope(
  scenario: EvalScenario,
  parameter: string,
  events: string,
): { passed: boolean; why: string } {
  return grade(scenario, TOOLS.readClip, {
    envelopes: [{ parameter, device: "t3/d0", eventCount: 2, events }],
  });
}

const PASSED = { passed: true, why: "" };

describe("automation-cc-control envelope range", () => {
  it.each(["1|1 0 / 3|1 127", "1|1 5 (5.00) ~0.5 3|1 120 (120.00)"])(
    "accepts a mod wheel sweep in 0..127: %s",
    (events) => {
      expect(
        gradeEnvelope(automationCcControlModWheel, "Mod Wheel", events),
      ).toStrictEqual(PASSED);
    },
  );

  it("rejects a mod wheel ramp written in 0..1", () => {
    const { passed, why } = gradeEnvelope(
      automationCcControlModWheel,
      "Mod Wheel",
      "1|1 0 / 3|1 1",
    );

    expect(passed).toBe(false);
    expect(why).toContain("most of 0..127");
  });

  it("accepts a pitch bend sweep in -64..64", () => {
    expect(
      gradeEnvelope(
        automationCcControlPitchBend,
        "Pitch Bend",
        "1|1 -64 (-64.00) / 3|1 64 (64.00)",
      ),
    ).toStrictEqual(PASSED);
  });

  it.each(["1|1 -1 / 3|1 1", "1|1 0 / 3|1 64"])(
    "rejects a pitch bend that misses the range: %s",
    (events) => {
      const { passed, why } = gradeEnvelope(
        automationCcControlPitchBend,
        "Pitch Bend",
        events,
      );

      expect(passed).toBe(false);
      expect(why).toContain("most of -64..64");
    },
  );

  it("rejects an envelope that falls", () => {
    const { passed, why } = gradeEnvelope(
      automationCcControlModWheel,
      "Mod Wheel",
      "1|1 127 / 3|1 0",
    );

    expect(passed).toBe(false);
    expect(why).toContain("should rise");
  });

  it("rejects an envelope on another parameter", () => {
    const { passed, why } = gradeEnvelope(
      automationCcControlModWheel,
      "Pressure",
      "1|1 0 / 3|1 127",
    );

    expect(passed).toBe(false);
    expect(why).toContain("got Pressure");
  });

  it("rejects a clip with no device envelope", () => {
    const { passed, why } = grade(automationCcControlModWheel, TOOLS.readClip, {
      envelopes: [],
    });

    expect(passed).toBe(false);
    expect(why).toContain("got none");
  });
});

describe("automation-cc-control envelope shape and place", () => {
  it("rejects a hold-then-jump", () => {
    const { passed, why } = gradeEnvelope(
      automationCcControlModWheel,
      "Mod Wheel",
      "1|1 0 _ 3|1 127",
    );

    expect(passed).toBe(false);
    expect(why).toContain("should ramp");
  });

  it("accepts a CC Control inside the rack", () => {
    expect(
      grade(automationCcControlModWheel, TOOLS.readClip, {
        envelopes: [
          {
            parameter: "Mod Wheel",
            device: "t3/d1/c0/d0",
            eventCount: 2,
            events: "1|1 0 / 3|1 127",
          },
        ],
      }),
    ).toStrictEqual(PASSED);
  });

  it("rejects the parameter on another track", () => {
    const { passed, why } = grade(automationCcControlModWheel, TOOLS.readClip, {
      envelopes: [
        {
          parameter: "Mod Wheel",
          device: "t2/d0",
          eventCount: 2,
          events: "1|1 0 / 3|1 127",
        },
      ],
    });

    expect(passed).toBe(false);
    expect(why).toContain("on t2/d0");
  });
});
