// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { automationWriteMixer } from "./automation-write.ts";

/** The mixer scenario's read-back check, run on a clip with these envelopes. */
function grade(volumeEvents: string): { passed: boolean; why: string } {
  const check = automationWriteMixer.assertions.find(
    (assertion) => assertion.type === "state",
  );

  if (check?.type !== "state" || typeof check.expect !== "function") {
    throw new Error("no state assertion with a matcher");
  }

  const result = {
    envelopes: [
      { parameter: "Track Volume", eventCount: 2, events: volumeEvents },
      { parameter: "Track Panning", eventCount: 2, events: "1|1 -1 / 3|1 1" },
      { parameter: "Send A", eventCount: 2, events: "1|1 0 / 3|1 0.5" },
    ],
  };

  return {
    passed: check.expect(result),
    why: check.explain?.(result) ?? "",
  };
}

describe("automation-write-mixer volume fade", () => {
  it.each(["1|1 0 / 3|1 0.85", "1|1 0 ~-0.7 3|1 1", "1|1 0 _ 1|3 0 / 3|1 1"])(
    "accepts a ramp: %s",
    (events) => {
      expect(grade(events)).toStrictEqual({ passed: true, why: "" });
    },
  );

  it.each(["1|1 0 _ 2|1 1", "1|1 0 _ 1|3 0.5 _ 2|1 1"])(
    "rejects a jump: %s",
    (events) => {
      const { passed, why } = grade(events);

      expect(passed).toBe(false);
      expect(why).toContain("fade in with a ramp");
      expect(why).toContain(events);
    },
  );
});
