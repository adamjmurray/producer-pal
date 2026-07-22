// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  probeSimplerSample,
  setSimplerGain,
  setSimplerSample,
} from "#src/tools/shared/device/simpler-sample.ts";
import { dbToLiveGain } from "#src/tools/shared/gain-utils.ts";

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

/**
 * Register a Simpler with a loaded sample child and return the sample mock.
 * @param opts - Options
 * @param opts.gain - Current linear gain on the sample (default 1)
 * @param opts.filePath - Sample file path (default "/tmp/kick.wav"; "" models a
 *   sample child with nothing loaded)
 * @returns The Sample mock object
 */
function registerSimplerWithSample(
  opts: { gain?: number; filePath?: string } = {},
): RegisteredMockObject {
  const sample = registerMockObject("sample-1", {
    type: "Sample",
    properties: {
      file_path: opts.filePath ?? "/tmp/kick.wav",
      gain: opts.gain ?? 1,
    },
  });

  registerMockObject("simpler-1", {
    path: livePath.track(0).device(0),
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: 0,
      parameters: children(),
      sample: ["id", "sample-1"],
    },
  });

  return sample;
}

/**
 * Register a non-Simpler device (an Operator) at the first track's first slot.
 * @returns The device mock object
 */
function registerOperator(): RegisteredMockObject {
  return registerMockObject("op-1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      class_display_name: "Operator",
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
    const device = registerOperator();

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

  it("warns and skips when the path is empty or whitespace", () => {
    const device = registerSimpler();

    setSimplerSample(LiveAPI.from("id simpler-1"), "   ", "updateDevice");

    expect(device.call).not.toHaveBeenCalledWith(
      "replace_sample",
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("non-empty file path"),
    );
  });

  it("warns and skips when the path is not absolute", () => {
    const device = registerSimpler();

    setSimplerSample(
      LiveAPI.from("id simpler-1"),
      "relative/kick.wav",
      "updateDevice",
    );

    expect(device.call).not.toHaveBeenCalledWith(
      "replace_sample",
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("absolute file path"),
    );
  });

  it("rejects a relative path even when a drive-letter appears mid-string", () => {
    // The absolute-path test is anchored (`^`): a drive-letter sequence buried
    // inside a relative path must NOT read as absolute.
    const device = registerSimpler();

    setSimplerSample(
      LiveAPI.from("id simpler-1"),
      "relative/C:/kick.wav",
      "updateDevice",
    );

    expect(device.call).not.toHaveBeenCalledWith(
      "replace_sample",
      expect.anything(),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("absolute file path"),
    );
  });

  it("trims surrounding whitespace before passing the path to Live", () => {
    const device = registerSimpler();

    setSimplerSample(
      LiveAPI.from("id simpler-1"),
      "  /tmp/kick.wav  ",
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith("replace_sample", "/tmp/kick.wav");
  });

  it("accepts Windows-style drive-letter paths", () => {
    const device = registerSimpler();

    setSimplerSample(
      LiveAPI.from("id simpler-1"),
      "C:\\samples\\kick.wav",
      "updateDevice",
    );

    expect(device.call).toHaveBeenCalledWith(
      "replace_sample",
      "C:\\samples\\kick.wav",
    );
  });

  it("uses the toolName parameter as warning prefix", () => {
    registerOperator();

    setSimplerSample(LiveAPI.from("id op-1"), "/tmp/kick.wav", "createDevice");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("createDevice:"),
    );
  });
});

describe("probeSimplerSample", () => {
  it("reports not-simpler for a non-Simpler device class", () => {
    const device = registerMockObject("op-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { class_display_name: "Operator" },
    });

    expect(
      probeSimplerSample(LiveAPI.from("id op-1"), "Operator"),
    ).toStrictEqual({ kind: "not-simpler" });
    // Short-circuits before touching the device's sample state.
    expect(device.get).not.toHaveBeenCalledWith("multi_sample_mode");
  });

  it("reports multisample for a Simpler in multi-sample mode", () => {
    registerSimpler({ multiSampleMode: 1 });

    expect(
      probeSimplerSample(LiveAPI.from("id simpler-1"), "Simpler"),
    ).toStrictEqual({ kind: "multisample" });
  });

  it("reports empty when no sample child is loaded", () => {
    registerSimpler();

    expect(
      probeSimplerSample(LiveAPI.from("id simpler-1"), "Simpler"),
    ).toStrictEqual({ kind: "empty" });
  });

  it("reports empty when the loaded sample has no file path", () => {
    registerSimplerWithSample({ filePath: "" });

    expect(
      probeSimplerSample(LiveAPI.from("id simpler-1"), "Simpler"),
    ).toStrictEqual({ kind: "empty" });
  });

  it("reports single with the sample path and gain when a sample is loaded", () => {
    registerSimplerWithSample({ gain: 0.5 });

    expect(
      probeSimplerSample(LiveAPI.from("id simpler-1"), "Simpler"),
    ).toStrictEqual({ kind: "single", path: "/tmp/kick.wav", gain: 0.5 });
  });
});

describe("setSimplerGain", () => {
  it("sets the loaded sample's gain, converting dB to linear", () => {
    const sample = registerSimplerWithSample();

    setSimplerGain(LiveAPI.from("id simpler-1"), 0, "updateDevice");

    expect(sample.set).toHaveBeenCalledWith("gain", dbToLiveGain(0));
  });

  it("warns and skips on a non-numeric value", () => {
    const sample = registerSimplerWithSample();

    setSimplerGain(
      LiveAPI.from("id simpler-1"),
      Number("oops"),
      "updateDevice",
    );

    expect(sample.set).not.toHaveBeenCalledWith("gain", expect.anything());
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("'gainDb' must be a number"),
    );
  });

  it("warns and skips on non-Simpler devices", () => {
    const device = registerOperator();

    setSimplerGain(LiveAPI.from("id op-1"), 0, "updateDevice");

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("'gainDb' only applies to Simpler devices"),
    );
  });

  it("warns and skips on Simpler in multi-sample mode", () => {
    const device = registerSimpler({ multiSampleMode: 1 });

    setSimplerGain(LiveAPI.from("id simpler-1"), 0, "updateDevice");

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("multi-sample mode"),
    );
    // The multi-sample guard must RETURN, not fall through into the loaded-sample
    // probe below it (which would emit a second, misleading warning).
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("requires a loaded sample"),
    );
  });

  it("warns and skips when no sample is loaded", () => {
    const device = registerSimpler();

    setSimplerGain(LiveAPI.from("id simpler-1"), 0, "updateDevice");

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("'gainDb' requires a loaded sample"),
    );
  });
});
