// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../update-device.ts";

describe("updateDevice - actions arg", () => {
  it("dispatches a device action to its specialized handler", () => {
    const simpler = registerMockObject("simpler-1", {
      path: livePath.track(0).device(0),
      type: "SimplerDevice",
      properties: {
        class_display_name: "Simpler",
        multi_sample_mode: 0,
        parameters: [],
      },
    });

    const result = updateDevice({ ids: "simpler-1", actions: ["reverse"] });

    expect(simpler.call).toHaveBeenCalledWith("reverse");
    expect(result).toStrictEqual({ id: "simpler-1" });
  });

  it("applies actions alongside params in one call", () => {
    const simpler = registerMockObject("simpler-1", {
      path: livePath.track(0).device(0),
      type: "SimplerDevice",
      properties: {
        class_display_name: "Simpler",
        multi_sample_mode: 0,
        parameters: [],
      },
    });

    updateDevice({
      ids: "simpler-1",
      params: "sample=/tmp/kick.wav",
      actions: ["reverse"],
    });

    expect(simpler.call).toHaveBeenCalledWith(
      "replace_sample",
      "/tmp/kick.wav",
    );
    expect(simpler.call).toHaveBeenCalledWith("reverse");
  });

  it("warns when actions are set on a non-device target (chain)", () => {
    registerMockObject("chain-1", {
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
      properties: { name: "Chain", mute: 0, solo: 0, devices: [] },
    });

    updateDevice({ ids: "chain-1", actions: ["reverse"] });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("'actions' not applicable to Chain"),
    );
  });
});
