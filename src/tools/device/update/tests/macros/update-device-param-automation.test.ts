// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  registerContinuousParam,
  registerVariationRack,
  registerNamedParams,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { automatedParam } from "#src/test/mocks/mock-registry.ts";
import { OVERRIDDEN } from "#src/tools/shared/arrangement/tracks/tests/automation-override-test-helpers.ts";

describe("updateDevice - params with arrangement automation", () => {
  it("says so on the param's own entry, each param on its own", () => {
    const [cutoff, , mix, untouched] = registerNamedParams([
      "Cutoff",
      "Reso",
      "Mix",
      "Drive",
    ]);

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
    registerVariationRack(macro);

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
    const [cutoff] = registerNamedParams(["Cutoff"]);

    automatedParam(cutoff as RegisteredMockObject, state);

    const result = updateDevice({
      id: "dev1",
      params: [{ name: "Cutoff", value }],
    });

    expect(JSON.stringify(result)).not.toContain("automation");
  });
});
