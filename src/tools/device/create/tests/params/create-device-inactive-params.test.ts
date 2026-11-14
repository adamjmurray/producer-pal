// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { INACTIVE_PARAM_DETAIL } from "#src/tools/device/update/helpers/params/param-read-back.ts";
import { createDevice } from "../../create-device.ts";
import { registerInsertTrack } from "./insert-track-fixtures.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  emitWarning: vi.fn(),
  emitWarningOnce: vi.fn(),
}));

describe("createDevice - params inactive in the device's mode", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("says so on the entry of a param Live marks inactive", async () => {
    registerInsertTrack({
      type: "Device",
      properties: {
        class_display_name: "Reverb",
        parameters: children("p0", "p1"),
      },
    });

    for (const [id, name, state] of [
      ["p0", "Decay", 1],
      ["p1", "Mix", 0],
    ] as const) {
      registerMockObject(id, {
        properties: {
          name,
          original_name: name,
          is_quantized: 0,
          is_enabled: 1,
          state,
          value: 0.5,
          min: 0,
          max: 1,
          canonical_parent: children("new-device"),
        },
        methods: {
          str_for_value: (value: unknown) => Number(value).toFixed(2),
        },
      });
    }

    const result = await createDevice({
      deviceName: "Reverb",
      path: "t0/d+",
      params: [
        { name: "Decay", value: "0.8" },
        { name: "Mix", value: "0.3" },
      ],
    });

    expect(result).toStrictEqual({
      id: "new-device",
      path: "t0/d0",
      params: [
        { id: "p0", name: "Decay", detail: INACTIVE_PARAM_DETAIL },
        { id: "p1", name: "Mix" },
      ],
    });
  });
});
