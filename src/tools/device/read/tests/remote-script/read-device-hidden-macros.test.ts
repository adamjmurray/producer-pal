// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A rack has 16 macro params however many it shows. A read leaves out the ones
// beyond the visible count that nothing maps to.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { remoteScriptSays } from "../../../tests/helpers/rack-macros-route-fixtures.ts";
import { readDevice } from "../../read-device.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const RACK_PATH = String(livePath.track(0).device(0));

/**
 * Register an Instrument Rack with Device On and all 16 macros. Macro 2 is
 * renamed "Drive".
 * @param count - Visible macros
 * @param mapped - Whether the rack has any mapping
 */
function registerRack(count: number, mapped: boolean): void {
  const names = [
    "Device On",
    ...Array.from({ length: 16 }, (_, i) => `Macro ${i + 1}`),
  ];

  registerMockObject("rack-1", {
    path: RACK_PATH,
    type: "Device",
    properties: {
      name: "Instrument Rack",
      class_display_name: "Instrument Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 0,
      is_active: 1,
      visible_macro_count: count,
      has_macro_mappings: mapped ? 1 : 0,
      parameters: names.flatMap((_, i) => ["id", `p${i}`]),
    },
  });

  for (const [i, original] of names.entries()) {
    registerMockObject(`p${i}`, {
      path: `id p${i}`,
      type: "DeviceParameter",
      properties: {
        name: original === "Macro 2" ? "Drive" : original,
        original_name: original,
        value: 0,
        min: 0,
        max: 127,
        state: 0,
        is_enabled: 1,
        automation_state: 0,
        is_quantized: 0,
      },
      methods: { str_for_value: (value: unknown) => String(value) },
    });
  }
}

/**
 * Read the rack's params and list their names.
 * @param include - The include to read with
 * @returns The names, in order
 */
async function readNames(
  include: ("params" | "param-values")[] = ["params"],
): Promise<string[]> {
  const result = (await readDevice({ id: "rack-1", include })) as {
    parameters: { name: string }[];
  };

  return result.parameters.map((param) => param.name);
}

const VISIBLE_NAMES = [
  "Device On",
  "Macro 1",
  "Drive (Macro 2)",
  ...Array.from({ length: 6 }, (_, i) => `Macro ${i + 3}`),
];

describe("a rack read's hidden macros", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("leaves out macros beyond the visible count when nothing is mapped", async () => {
    registerRack(8, false);

    expect(await readNames()).toStrictEqual(VISIBLE_NAMES);
  });

  it("leaves them out of param-values too", async () => {
    registerRack(4, false);

    expect(await readNames(["param-values"])).toStrictEqual([
      "Device On",
      "Macro 1",
      "Drive (Macro 2)",
      "Macro 3",
      "Macro 4",
    ]);
  });

  it("keeps every macro of a rack with mappings until the remote script says which", async () => {
    registerRack(8, true);
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(await readNames()).toHaveLength(17);
  });

  it("drops the hidden macros nothing maps to once the remote script answers", async () => {
    registerRack(8, true);
    remoteScriptSays({ mapped: [2, 10] });

    expect(await readNames()).toStrictEqual([...VISIBLE_NAMES, "Macro 10"]);
  });

  it("keeps every visible macro, mapped or not", async () => {
    registerRack(8, true);
    remoteScriptSays({ mapped: [] });

    expect(await readNames()).toStrictEqual(VISIBLE_NAMES);
  });

  it("reads all 16 when the rack shows them all", async () => {
    registerRack(16, false);

    expect(await readNames()).toHaveLength(17);
  });
});
