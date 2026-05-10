// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { setSimplerSample } from "#src/tools/shared/device/simpler-sample.ts";

function registerSimpler(opts: { multiSampleMode?: number } = {}) {
  return registerMockObject("simpler-1", {
    path: livePath.track(0).device(0),
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: opts.multiSampleMode ?? 0,
      parameters: children(),
    },
  });
}

describe("setSimplerSample", () => {
  it("calls replace_sample on Simpler with the file path", () => {
    const device = registerSimpler();

    setSimplerSample(
      LiveAPI.from("id simpler-1"),
      "/tmp/kick.wav",
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith("replace_sample", "/tmp/kick.wav");
  });

  it("preserves whitespace in file paths", () => {
    const device = registerSimpler();

    setSimplerSample(
      LiveAPI.from("id simpler-1"),
      "/tmp/My Samples/kick drum.wav",
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith(
      "replace_sample",
      "/tmp/My Samples/kick drum.wav",
    );
  });

  it("warns and skips on non-Simpler devices, naming the device class", () => {
    const device = registerMockObject("op-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        class_display_name: "Operator",
        parameters: children(),
      },
    });

    setSimplerSample(LiveAPI.from("id op-1"), "/tmp/kick.wav", "updateDevice");

    expect(device.call).not.toHaveBeenCalledWith(
      "replace_sample",
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        "updateDevice: 'sample' only applies to Simpler devices (got Operator)",
      ),
    );
  });

  it("warns and skips on Simpler in multi-sample mode", () => {
    const device = registerSimpler({ multiSampleMode: 1 });

    setSimplerSample(
      LiveAPI.from("id simpler-1"),
      "/tmp/kick.wav",
      "updateDevice",
    );

    expect(device.call).not.toHaveBeenCalledWith(
      "replace_sample",
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("multi-sample mode"),
    );
  });

  it("uses the toolName parameter as warning prefix", () => {
    registerMockObject("op-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        class_display_name: "Operator",
        parameters: children(),
      },
    });

    setSimplerSample(LiveAPI.from("id op-1"), "/tmp/kick.wav", "createDevice");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("createDevice:"),
    );
  });
});
