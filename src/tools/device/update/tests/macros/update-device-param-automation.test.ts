// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  registerContinuousParam,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { automatedParam } from "#src/test/mocks/mock-registry.ts";

const OVERRIDDEN =
  "arrangement automation overridden — Live ignores it until Re-Enable Automation";

/**
 * Register a device whose params are continuous 0..1 and not automated yet.
 * @param names - The params' names, in order
 * @returns The registered params, in order
 */
function registerParams(...names: string[]): RegisteredMockObject[] {
  registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      parameters: children(...names.map((_, index) => `p${index}`)),
    },
  });

  return names.map((name, index) =>
    registerMockObject(`p${index}`, {
      properties: {
        name,
        original_name: name,
        is_quantized: 0,
        is_enabled: 1,
        value: 0.5,
        min: 0,
        max: 1,
      },
      methods: { str_for_value: (value: unknown) => Number(value).toFixed(2) },
    }),
  );
}

describe("updateDevice - params with arrangement automation", () => {
  it("says so on the param's own entry, each param on its own", () => {
    const [cutoff, , mix, untouched] = registerParams(
      "Cutoff",
      "Reso",
      "Mix",
      "Drive",
    );

    automatedParam(cutoff as RegisteredMockObject);
    automatedParam(mix as RegisteredMockObject, 2);

    const result = updateDevice({
      id: "dev1",
      params: [
        { name: "Cutoff", value: "0.8" },
        { name: "Reso", value: "0.3" },
        { name: "Mix", value: "0.6" },
      ],
    }) as { params: unknown[] };

    expect(result.params).toStrictEqual([
      { id: "p0", name: "Cutoff", detail: OVERRIDDEN },
      { id: "p1", name: "Reso" },
      { id: "p2", name: "Mix" },
    ]);
    expect(untouched?.get).not.toHaveBeenCalledWith("automation_state");
  });

  it("keeps the read-back detail when a later step moved the value", () => {
    const macro = registerContinuousParam("macro-1", { name: "Macro 1" });

    automatedParam(macro);
    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_chains: 1,
        variation_count: 3,
        selected_variation_index: 0,
        parameters: children("macro-1"),
      },
      methods: {
        recall_selected_variation: () => {
          macro.properties.value = 0.9;
        },
      },
    });

    const result = updateDevice({
      id: "rack",
      params: [{ name: "Macro 1", value: "50" }],
      macroVariation: "load",
      macroVariationIndex: 0,
    }) as { params: unknown[] };

    expect(result.params).toStrictEqual([
      {
        id: "macro-1",
        name: "Macro 1",
        value: 90,
        detail: `value read back as shown, not as sent; ${OVERRIDDEN}`,
      },
    ]);
  });

  it.each([
    ["already overridden", 2, "0.8"],
    ["no lane, or unknown while playing from Session", 0, "0.8"],
    ["a lane when the value it holds is written again", 1, "0.5"],
  ])("says nothing for %s", (_, state, value) => {
    const [cutoff] = registerParams("Cutoff");

    automatedParam(cutoff as RegisteredMockObject, state);

    const result = updateDevice({
      id: "dev1",
      params: [{ name: "Cutoff", value }],
    });

    expect(JSON.stringify(result)).not.toContain("automation");
  });
});
