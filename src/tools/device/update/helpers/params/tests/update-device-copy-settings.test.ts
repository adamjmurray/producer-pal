// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The settings a specialized device keeps beside its params (EQ Eight's
// globalMode, Simpler's sample, ...) go through copyParamsFrom too.

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/tools/device/update/tests/update-device-test-helpers.ts";
import { automatedParam } from "#src/test/mocks/mock-registry.ts";
import { automationOverriddenDetail } from "#src/tools/shared/arrangement/tracks/automation-override.ts";
import {
  type DeviceSpec,
  registerCopyDevice,
  registerThresholdPair,
  valuesOf,
  copyOnto,
  entryFor,
} from "./copy-params-test-helpers.ts";

const EQ_EIGHT: DeviceSpec = {
  className: "Eq8Device",
  displayName: "EQ Eight",
  params: [{ name: "1 Gain A", value: 0.5 }],
};

describe("updateDevice - copyParamsFrom settings", () => {
  beforeEach(() => {
    mockNonExistentObjects();
  });

  it("copies a setting that differs, beside the params", () => {
    registerCopyDevice("101", {
      ...EQ_EIGHT,
      params: [{ name: "1 Gain A", value: 0.75 }],
      extra: { global_mode: 2, oversample: 1 },
    });

    const target = registerCopyDevice("102", {
      ...EQ_EIGHT,
      slot: 1,
      extra: { global_mode: 0, oversample: 1 },
    });

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 1, settings: ["globalMode"] },
      }),
    );
    expect(target.device.set).toHaveBeenCalledTimes(1);
    expect(target.device.set).toHaveBeenCalledWith("global_mode", 2);
    expect(valuesOf(target)).toStrictEqual([0.75]);
  });

  it("copies a setting that is on or off", () => {
    registerCopyDevice("101", { ...EQ_EIGHT, extra: { oversample: 1 } });

    const target = registerCopyDevice("102", {
      ...EQ_EIGHT,
      slot: 1,
      extra: { oversample: 0 },
    });

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 0, settings: ["oversample"] },
      }),
    );
    expect(target.device.set).toHaveBeenCalledWith("oversample", 1);
  });

  it("says why a setting didn't copy, and carries on", () => {
    registerCopyDevice("101", {
      className: "SpectralResonatorDevice",
      displayName: "Spectral Resonator",
      params: [{ name: "Freq", value: 0.75 }],
      extra: { pitch_bend_range: 99 },
    });

    const target = registerCopyDevice("102", {
      className: "SpectralResonatorDevice",
      displayName: "Spectral Resonator",
      slot: 1,
      params: [{ name: "Freq", value: 0.5 }],
      extra: { pitch_bend_range: 12 },
    });

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: {
          params: 1,
          skipped: [expect.stringContaining("pitchBendRange: ")],
        },
      }),
    );
    expect(valuesOf(target)).toStrictEqual([0.75]);
  });

  it("leaves a Compressor's sidechain routing as it is", () => {
    const routing = (name: string): Record<string, unknown> => ({
      input_routing_channel: { display_name: name, identifier: 1 },
      available_input_routing_channels: [
        { display_name: "Pre FX", identifier: 0 },
        { display_name: "Post FX", identifier: 1 },
      ],
    });

    registerCopyDevice("101", { params: [], extra: routing("Post FX") });

    const target = registerCopyDevice("102", {
      slot: 1,
      params: [],
      extra: routing("Pre FX"),
    });

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 0 },
      }),
    );
    expect(target.device.set).not.toHaveBeenCalled();
  });

  describe("a Simpler's sample", () => {
    /**
     * Register a Simpler holding a sample.
     * @param id - The device's id
     * @param slot - Its position on track 0
     * @param path - The sample's file
     * @returns The Simpler and its sample
     */
    function registerSimpler(
      id: string,
      slot: number,
      path: string,
    ): { device: RegisteredMockObject; sample: RegisteredMockObject } {
      const sample = registerMockObject(`${id}-sample`, {
        type: "Sample",
        properties: { file_path: path, gain: 0.5 },
      });
      const { device } = registerCopyDevice(id, {
        className: "OriginalSimpler",
        displayName: "Simpler",
        slot,
        params: [],
        extra: { multi_sample_mode: 0, sample: children(`${id}-sample`) },
      });

      return { device, sample };
    }

    it("copies it by loading the same file", () => {
      registerSimpler("101", 0, "/Library/kick.aif");

      const { device, sample } = registerSimpler(
        "102",
        1,
        "/Library/snare.aif",
      );

      device.call.mockImplementation((method: string, path: unknown) => {
        if (method === "replace_sample") {
          sample.properties.file_path = path;
        }
      });

      const result = copyOnto("102");

      expect(device.call).toHaveBeenCalledWith(
        "replace_sample",
        "/Library/kick.aif",
      );
      expect(result).toStrictEqual(
        entryFor("102", {
          copied: { params: 0, settings: ["sample"] },
        }),
      );
    });

    it("says so when Live loads nothing", () => {
      registerSimpler("101", 0, "/Library/kick.aif");
      registerSimpler("102", 1, "/Library/snare.aif");

      const result = copyOnto("102");

      expect(result).toStrictEqual(
        entryFor("102", {
          copied: {
            params: 0,
            skipped: [
              'sample: not loaded — check the path; "/Library/snare.aif" is still there',
            ],
          },
        }),
      );
    });
  });

  it("says when a copy overrode arrangement automation", () => {
    const target = registerThresholdPair({ value: 0.5 });

    automatedParam(target.params[0] as RegisteredMockObject);

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 1 },
        detail: `${automationOverriddenDetail("copyParamsFrom")} (Threshold)`,
      }),
    );
  });
});
