// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { eqEightSpec } from "../devices/eq-eight.ts";
import { applyInactiveStates } from "../specialized-device-inactive.ts";
import { type InactiveWhenRule } from "../specialized-device-types.ts";

/**
 * Band 3's A and B params beside EQ Eight's mode, all reading active.
 * @param mode - globalMode value
 * @returns Parameter entries
 */
function eqEightBand3(mode: string): Record<string, unknown>[] {
  return [
    { name: "globalMode", value: mode },
    { name: "3 Filter On A", value: "On" },
    { name: "3 Filter Type A", value: "Bell" },
    { name: "3 Filter On B", value: "On" },
    { name: "3 Filter Type B", value: "Bell" },
    { name: "8 Q B", value: 0.71 },
  ];
}

/**
 * The state each param reads after the rules run.
 * @param mode - globalMode value
 * @returns Param name → state
 */
function statesIn(mode: string): Record<string, unknown> {
  const params = eqEightBand3(mode);

  applyInactiveStates(eqEightSpec.inactiveWhen as InactiveWhenRule[], params);

  return Object.fromEntries(params.map((p) => [p.name, p.state]));
}

describe("eqEightSpec.inactiveWhen (real rule data)", () => {
  it("marks every B-side param inactive in stereo", () => {
    expect(statesIn("stereo")).toStrictEqual({
      globalMode: undefined,
      "3 Filter On A": undefined,
      "3 Filter Type A": undefined,
      "3 Filter On B": "inactive",
      "3 Filter Type B": "inactive",
      "8 Q B": "inactive",
    });
  });

  it.each(["L/R", "M/S"])("leaves both sides active in %s", (mode) => {
    expect(Object.values(statesIn(mode)).every((s) => s == null)).toBe(true);
  });
});
