// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  applySpecializedActions,
  applySpecializedParamWrite,
  readSpecializedParams,
} from "../../../specialized-device-registry.ts";
import { expectWriteRefused } from "../../refused-write-assertions.ts";

/**
 * Register a mock Simpler holding a 2-second sample at 44.1 kHz.
 * @param sampleProps - Sample property overrides; null loads no sample
 * @returns The Simpler, and its sample's mock when one is loaded
 */
function registerSimpler(
  sampleProps: Record<string, unknown> | null = {},
  deviceProps: Record<string, unknown> = {},
): {
  device: LiveAPI;
  sample?: RegisteredMockObject;
} {
  const sample =
    sampleProps == null
      ? undefined
      : registerMockObject("sample-1", {
          type: "Sample",
          properties: {
            file_path: "/tmp/loop.wav",
            sample_rate: 44100,
            length: 88200,
            slicing_style: 2,
            slicing_sensitivity: 0.5,
            slicing_beat_division: 4,
            slicing_region_count: 4,
            slices: [0, 22050, 44100, 66150],
            ...sampleProps,
          },
        });

  registerMockObject("simpler-1", {
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: 0,
      playback_mode: 2,
      sample: sample ? ["id", "sample-1"] : [],
      ...deviceProps,
    },
  });

  return { device: LiveAPI.from("id simpler-1"), sample };
}

describe("Simpler slicing", () => {
  describe("read", () => {
    it("reads every slice setting, and slices in seconds", () => {
      const { device } = registerSimpler();
      const params = readSpecializedParams(device);

      expect(params).toContainEqual({ name: "sliceBy", value: "region" });
      expect(params).toContainEqual({ name: "sliceSensitivity", value: 0.5 });
      expect(params).toContainEqual({ name: "sliceDivision", value: "1/4" });
      expect(params).toContainEqual({ name: "sliceRegions", value: 4 });
      expect(params).toContainEqual({
        name: "slices",
        value: [0, 0.5, 1, 1.5],
      });
    });

    it.each([
      ["with no sample loaded", null, {}],
      ["in multi-sample mode", {}, { multi_sample_mode: 1 }],
    ])("omits them all %s", (_case, sampleProps, deviceProps) => {
      const { device } = registerSimpler(sampleProps, deviceProps);
      const names = readSpecializedParams(device).map((param) => param.name);

      expect(names).not.toContain("sliceBy");
      expect(names).not.toContain("sliceSensitivity");
      expect(names).not.toContain("sliceDivision");
      expect(names).not.toContain("sliceRegions");
      expect(names).not.toContain("slices");
    });
  });

  it("omits slices outside slicing mode, where the sample has none", () => {
    const { device } = registerSimpler({}, { playback_mode: 0 });
    const params = readSpecializedParams(device);

    expect(params.map((param) => param.name)).not.toContain("slices");
    expect(params).toContainEqual({ name: "sliceBy", value: "region" });
  });

  describe("write", () => {
    it.each([
      ["sliceBy", "Manual", "slicing_style", 3],
      ["sliceDivision", "1/16t", "slicing_beat_division", 1],
      ["sliceDivision", "4 bars", "slicing_beat_division", 10],
      ["sliceSensitivity", "0.25", "slicing_sensitivity", 0.25],
      ["sliceRegions", "64", "slicing_region_count", 64],
    ])("sets %s to %s on the sample", (name, value, property, written) => {
      const { device, sample } = registerSimpler();

      applySpecializedParamWrite(device, name, value);

      expect(sample?.set).toHaveBeenCalledWith(property, written);
    });

    it.each([
      ["sliceBy", "zero-crossing", "not a valid sliceBy"],
      ["sliceDivision", "1/32", "not a valid sliceDivision"],
      ["sliceSensitivity", "7", "must be a number 0-1"],
      ["sliceSensitivity", "", "must be a number 0-1"],
      ["sliceSensitivity", "lots", "must be a number 0-1"],
      ["sliceRegions", "1", "must be an integer 2-64"],
      ["sliceRegions", "65", "must be an integer 2-64"],
      ["sliceRegions", "2.5", "must be an integer 2-64"],
    ])("refuses %s %s, which Live would ignore", (name, value, reason) => {
      const { device, sample } = registerSimpler();

      expectWriteRefused(
        applySpecializedParamWrite(device, name, value),
        name,
        reason,
      );
      expect(sample?.set).not.toHaveBeenCalled();
    });

    it.each([
      ["sliceBy", "beat"],
      ["sliceDivision", "1/8"],
      ["sliceSensitivity", "0.5"],
      ["sliceRegions", "8"],
    ])("refuses %s with no sample loaded", (name, value) => {
      const { device } = registerSimpler(null);

      expectWriteRefused(
        applySpecializedParamWrite(device, name, value),
        name,
        "needs a single sample loaded",
      );
    });
  });

  describe("actions", () => {
    it("setSlices switches to manual and replaces the slices", () => {
      const { device, sample } = registerSimpler();
      const action = "setSlices(1, 0.5, 0, 1)";

      expect(applySpecializedActions(device, [action])).toStrictEqual([
        { action },
      ]);
      expect(sample?.set).toHaveBeenCalledWith("slicing_style", 3);
      expect(sample?.call.mock.calls).toStrictEqual([
        ["clear_slices"],
        ["insert_slice", 44100],
        ["insert_slice", 22050],
      ]);
    });

    it.each([
      ["setSlices", "requires at least one position in seconds"],
      [
        "setSlices(0.5, 2)",
        '"2" is not a position inside the sample (0 to 2 seconds)',
      ],
      [
        "setSlices(-1)",
        '"-1" is not a position inside the sample (0 to 2 seconds)',
      ],
      [
        "setSlices(soon)",
        '"soon" is not a position inside the sample (0 to 2 seconds)',
      ],
    ])("refuses %s and changes nothing", (action, detail) => {
      const { device, sample } = registerSimpler();

      expect(applySpecializedActions(device, [action])).toStrictEqual([
        { action, ok: false, detail },
      ]);
      expect(sample?.set).not.toHaveBeenCalled();
      expect(sample?.call).not.toHaveBeenCalled();
    });

    it("refuses more slices than Simpler holds", () => {
      const { device, sample } = registerSimpler();
      const positions = Array.from({ length: 64 }, (_, i) => (i + 1) / 100);
      const action = `setSlices(${positions.join(", ")})`;

      expect(applySpecializedActions(device, [action])).toStrictEqual([
        {
          action,
          ok: false,
          detail:
            "Simpler holds at most 64 slices (got 65, counting the one at 0)",
        },
      ]);
      expect(sample?.call).not.toHaveBeenCalled();
    });

    it("resetSlices brings back the style's own slices", () => {
      const { device, sample } = registerSimpler();

      expect(applySpecializedActions(device, ["resetSlices"])).toStrictEqual([
        { action: "resetSlices" },
      ]);
      expect(sample?.call).toHaveBeenCalledWith("reset_slices");
    });

    it("sliceToDrumRack leaves a slicing Simpler pending for update-device", () => {
      const { device } = registerSimpler();

      expect(
        applySpecializedActions(device, ["sliceToDrumRack"]),
      ).toStrictEqual([{ action: "sliceToDrumRack", detail: "converting" }]);
    });

    it.each(["sliceToDrumRack", "setSlices(1)", "resetSlices"])(
      "refuses %s on a Simpler that isn't slicing",
      (action) => {
        const { device, sample } = registerSimpler({}, { playback_mode: 1 });

        expect(applySpecializedActions(device, [action])).toStrictEqual([
          {
            action,
            ok: false,
            detail:
              "the Simpler isn't in slicing mode: set playbackMode to slicing",
          },
        ]);
        expect(sample?.call).not.toHaveBeenCalled();
      },
    );

    it.each(["setSlices(1)", "resetSlices"])(
      "refuses %s with no sample loaded",
      (action) => {
        const { device } = registerSimpler(null);

        expect(applySpecializedActions(device, [action])).toStrictEqual([
          { action, ok: false, detail: "needs a single sample loaded" },
        ]);
      },
    );
  });
});
