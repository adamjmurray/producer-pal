// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A CC Control as Max's Live API sees it: `type` is all it answers at device
// level, `get("parameters")` lists nothing, and `getcount` plus each
// `parameters N` child still work.

import { vi } from "vitest";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** The first parameters of a real CC Control, in Live's order. */
export const CC_CONTROL_PARAM_NAMES = [
  "Device On",
  "Mod Wheel",
  "Pitch Bend",
  "Pressure",
  "1",
  "2",
];

interface CcControlOptions {
  /** The device's mock id (default "cc-1") */
  id?: string;
  /** Where it sits (default track 0, device 0) */
  path?: string;
  /** The first parameter's mock id (default 900, then 901, ...) */
  paramIdStart?: number;
  /** Parameter names, in order (default {@link CC_CONTROL_PARAM_NAMES}) */
  paramNames?: string[];
}

/**
 * Register a CC Control and its parameters. Parameter ids are numeric, as
 * Live's are, counting up from `paramIdStart`.
 * @param options - Where it sits and what it holds
 * @returns The CC Control mock
 */
export function registerCcControl({
  id = "cc-1",
  path = String(livePath.track(0).device(0)),
  paramIdStart = 900,
  paramNames = CC_CONTROL_PARAM_NAMES,
}: CcControlOptions = {}): RegisteredMockObject {
  const device = registerMockObject(id, {
    path,
    type: "CcControlDevice",
    properties: { parameters: [] },
  });

  for (const [index, name] of paramNames.entries()) {
    registerMockObject(String(paramIdStart + index), {
      path: `${path} parameters ${index}`,
      type: "DeviceParameter",
      properties: {
        name,
        original_name: name,
        is_quantized: name === "Device On" ? 1 : 0,
        is_enabled: 1,
        automation_state: 0,
        state: 0,
        value: 0,
        min: 0,
        max: name === "Device On" ? 1 : 127,
        default_value: 0,
      },
      methods: { str_for_value: (value: unknown) => String(value) },
    });
  }

  const count = vi.fn((name: string) =>
    name === "parameters" ? paramNames.length : 0,
  );
  // Max's built-in getcount has no mock implementation; answer it for this one.
  const proto = LiveAPI.prototype as unknown as {
    getcount: (this: LiveAPI, name: string) => number;
  };
  const other = proto.getcount as typeof proto.getcount | undefined;

  proto.getcount = function (this: LiveAPI, name: string): number {
    return this.path === path ? count(name) : (other?.call(this, name) ?? 0);
  };

  return device;
}
