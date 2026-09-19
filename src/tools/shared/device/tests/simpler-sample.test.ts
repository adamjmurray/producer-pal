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
import { dbToLiveGain } from "#src/tools/shared/helpers/gain-conversion.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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
 * Register live_app reporting a specific Live version.
 * @param version - Version string `get_version_string` should return
 */
function registerLiveApp(version: string): void {
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => version },
  });
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

/**
 * Assert a sample write was refused: the reason came back, Live was untouched,
 * and nothing warned. The reason is what becomes the param's own `ok: false`
 * entry, so a refusal that answered null would report a value nothing wrote.
 * @param refused - What setSimplerSample returned
 * @param device - The device mock the write was aimed at
 * @param reason - Substring the returned reason must contain
 */
function expectSampleRefused(
  refused: string | null,
  device: RegisteredMockObject,
  reason: string,
): void {
  expect(refused).toStrictEqual(expect.stringContaining(reason));
  expect(device.call).not.toHaveBeenCalledWith(
    "replace_sample",
    expect.anything(),
  );
  expect(capturedWarnings()).toStrictEqual([]);
}

describe("setSimplerSample", () => {
  it("calls replace_sample on Simpler with the file path", () => {
    const device = registerSimpler();

    // Null says the write ran, which is what puts a value in the caller's
    // `params` result; a refusal below must answer with its reason.
    expect(
      setSimplerSample(LiveAPI.from("id simpler-1"), "/tmp/kick.wav"),
    ).toBeNull();

    expect(device.call).toHaveBeenCalledWith("replace_sample", "/tmp/kick.wav");
  });

  it("preserves whitespace in file paths", () => {
    const device = registerSimpler();

    setSimplerSample(
      LiveAPI.from("id simpler-1"),
      "/tmp/My Samples/kick drum.wav",
    );

    expect(device.call).toHaveBeenCalledWith(
      "replace_sample",
      "/tmp/My Samples/kick drum.wav",
    );
  });

  it("refuses a non-Simpler device, naming the device class", () => {
    const device = registerOperator();

    expectSampleRefused(
      setSimplerSample(LiveAPI.from("id op-1"), "/tmp/kick.wav"),
      device,
      "'sample' only applies to Simpler devices (got Operator)",
    );
  });

  it("refuses the write when Live is too old for replace_sample", () => {
    const device = registerSimpler();

    registerLiveApp("12.3.8");

    expectSampleRefused(
      setSimplerSample(LiveAPI.from("id simpler-1"), "/tmp/kick.wav"),
      device,
      "'sample' requires Live 12.4",
    );
  });

  it("loads the sample on a Live newer than 12.4", () => {
    const device = registerSimpler();

    registerLiveApp("13.0");

    setSimplerSample(LiveAPI.from("id simpler-1"), "/tmp/kick.wav");

    expect(device.call).toHaveBeenCalledWith("replace_sample", "/tmp/kick.wav");
  });

  it("refuses a Simpler in multi-sample mode", () => {
    const device = registerSimpler({ multiSampleMode: 1 });

    expectSampleRefused(
      setSimplerSample(LiveAPI.from("id simpler-1"), "/tmp/kick.wav"),
      device,
      "multi-sample mode",
    );
  });

  it("refuses an empty or whitespace path", () => {
    const device = registerSimpler();

    expectSampleRefused(
      setSimplerSample(LiveAPI.from("id simpler-1"), "   "),
      device,
      "non-empty file path",
    );
  });

  it("refuses a path that is not absolute", () => {
    const device = registerSimpler();

    expectSampleRefused(
      setSimplerSample(LiveAPI.from("id simpler-1"), "relative/kick.wav"),
      device,
      "absolute file path",
    );
  });

  it("rejects a relative path even when a drive-letter appears mid-string", () => {
    // The absolute-path test is anchored (`^`): a drive-letter sequence buried
    // inside a relative path must NOT read as absolute.
    const device = registerSimpler();

    expectSampleRefused(
      setSimplerSample(LiveAPI.from("id simpler-1"), "relative/C:/kick.wav"),
      device,
      "absolute file path",
    );
  });

  it("trims surrounding whitespace before passing the path to Live", () => {
    const device = registerSimpler();

    setSimplerSample(LiveAPI.from("id simpler-1"), "  /tmp/kick.wav  ");

    expect(device.call).toHaveBeenCalledWith("replace_sample", "/tmp/kick.wav");
  });

  it("accepts Windows-style drive-letter paths", () => {
    const device = registerSimpler();

    setSimplerSample(LiveAPI.from("id simpler-1"), "C:\\samples\\kick.wav");

    expect(device.call).toHaveBeenCalledWith(
      "replace_sample",
      "C:\\samples\\kick.wav",
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

    expect(setSimplerGain(LiveAPI.from("id simpler-1"), 0)).toBeNull();

    expect(sample.set).toHaveBeenCalledWith("gain", dbToLiveGain(0));
  });

  it("refuses a non-numeric value", () => {
    const sample = registerSimplerWithSample();

    expect(
      setSimplerGain(LiveAPI.from("id simpler-1"), Number("oops")),
    ).toStrictEqual(expect.stringContaining("'gainDb' must be a number"));

    expect(sample.set).not.toHaveBeenCalledWith("gain", expect.anything());
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses a non-Simpler device", () => {
    const device = registerOperator();

    expect(setSimplerGain(LiveAPI.from("id op-1"), 0)).toStrictEqual(
      expect.stringContaining("'gainDb' only applies to Simpler devices"),
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses a Simpler in multi-sample mode", () => {
    const device = registerSimpler({ multiSampleMode: 1 });

    // The multi-sample guard must RETURN, not fall through into the
    // loaded-sample probe below it, which would answer with the wrong reason.
    expect(setSimplerGain(LiveAPI.from("id simpler-1"), 0)).toStrictEqual(
      expect.stringContaining("multi-sample mode"),
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses the write when no sample is loaded", () => {
    const device = registerSimpler();

    expect(setSimplerGain(LiveAPI.from("id simpler-1"), 0)).toStrictEqual(
      expect.stringContaining("'gainDb' requires a loaded sample"),
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });
});
