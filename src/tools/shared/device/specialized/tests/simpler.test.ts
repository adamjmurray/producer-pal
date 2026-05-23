// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { dbToLiveGain } from "#src/tools/shared/gain-utils.ts";
import {
  applySpecializedActions,
  applySpecializedParamWrite,
  readSpecializedParams,
} from "../specialized-device-registry.ts";

interface SimplerProps {
  multiSampleMode?: number;
  playbackMode?: number;
  slicingPlaybackMode?: number;
  retrigger?: number;
  voices?: number;
  samplePath?: string;
}

/**
 * Register a mock Simpler device (and optional sample child) and return its
 * LiveAPI.
 * @param props - Property overrides
 * @returns The Simpler LiveAPI object
 */
function registerSimpler(props: SimplerProps = {}): LiveAPI {
  if (props.samplePath != null) {
    registerMockObject("sample-1", {
      type: "Sample",
      properties: { file_path: props.samplePath, gain: 1 },
    });
  }

  registerMockObject("simpler-1", {
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: props.multiSampleMode ?? 0,
      playback_mode: props.playbackMode ?? 0,
      slicing_playback_mode: props.slicingPlaybackMode ?? 0,
      retrigger: props.retrigger ?? 0,
      voices: props.voices ?? 1,
      sample: props.samplePath != null ? ["id", "sample-1"] : [],
    },
    methods: {
      guess_playback_length: () => 16,
    },
  });

  return LiveAPI.from("id simpler-1");
}

describe("Simpler pseudo-params", () => {
  describe("read", () => {
    it("reads playback config and sample state", () => {
      const device = registerSimpler({
        playbackMode: 2,
        slicingPlaybackMode: 1,
        retrigger: 1,
        voices: 8,
        samplePath: "/tmp/kick.wav",
      });

      const params = readSpecializedParams(device);

      expect(params).toContainEqual({ name: "sample", value: "/tmp/kick.wav" });
      expect(params).toContainEqual({ name: "gainDb", value: 24 }); // gain 1 → 24 dB
      expect(params).toContainEqual({ name: "playbackMode", value: "slicing" });
      expect(params).toContainEqual({
        name: "slicingPlaybackMode",
        value: "poly",
      });
      expect(params).toContainEqual({ name: "retrigger", value: true });
      expect(params).toContainEqual({ name: "voices", value: 8 });
      expect(params).toContainEqual({ name: "multiSampleMode", value: false });
      expect(params).toContainEqual({
        name: "estimatedPlaybackLength",
        value: 16,
      });
    });

    it("omits sample and estimatedPlaybackLength when no sample is loaded", () => {
      const device = registerSimpler();

      const params = readSpecializedParams(device);
      const names = params.map((p) => p.name);

      expect(names).not.toContain("sample");
      expect(names).not.toContain("gainDb");
      expect(names).not.toContain("estimatedPlaybackLength");
    });

    it("reports multiSampleMode true in multi-sample mode", () => {
      const device = registerSimpler({ multiSampleMode: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "multiSampleMode",
        value: true,
      });
    });
  });

  describe("write", () => {
    it("sets playbackMode by label", () => {
      const device = registerSimpler();

      applySpecializedParamWrite(device, "playbackMode", "one-shot", "t");

      expect(device.set).toHaveBeenCalledWith("playback_mode", 1);
    });

    it("warns on an invalid playbackMode", () => {
      const device = registerSimpler();

      applySpecializedParamWrite(device, "playbackMode", "bogus", "t");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid playbackMode"),
      );
    });

    it("sets slicingPlaybackMode by label", () => {
      const device = registerSimpler();

      applySpecializedParamWrite(device, "slicingPlaybackMode", "thru", "t");

      expect(device.set).toHaveBeenCalledWith("slicing_playback_mode", 2);
    });

    it("sets retrigger", () => {
      const device = registerSimpler();

      applySpecializedParamWrite(device, "retrigger", "true", "t");

      expect(device.set).toHaveBeenCalledWith("retrigger", 1);
    });

    it("sets gainDb on the loaded sample, converting dB to linear", () => {
      registerSimpler({ samplePath: "/tmp/kick.wav" });

      applySpecializedParamWrite(
        LiveAPI.from("id simpler-1"),
        "gainDb",
        0,
        "t",
      );

      expect(LiveAPI.from("id sample-1").set).toHaveBeenCalledWith(
        "gain",
        dbToLiveGain(0),
      );
    });

    it("sets voices when in the allowed set", () => {
      const device = registerSimpler();

      applySpecializedParamWrite(device, "voices", 12, "t");

      expect(device.set).toHaveBeenCalledWith("voices", 12);
    });

    it("warns on a voices value not in the allowed set", () => {
      const device = registerSimpler();

      applySpecializedParamWrite(device, "voices", 9, "t");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("voices must be one of"),
      );
    });

    it("warns and skips when writing a read-only param", () => {
      const device = registerSimpler();

      const handled = applySpecializedParamWrite(
        device,
        "multiSampleMode",
        "true",
        "t",
      );

      expect(handled).toBe(true);
      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("read-only"),
      );
    });
  });

  describe("actions", () => {
    it.each([
      ["reverse", "reverse"],
      ["crop", "crop"],
      ["warpDouble", "warp_double"],
      ["warpHalf", "warp_half"],
    ])("dispatches %s to %s", (action, method) => {
      const device = registerSimpler();

      applySpecializedActions(device, [action], "updateDevice");

      expect(device.call).toHaveBeenCalledWith(method);
    });

    it("dispatches warpAs(N) to warp_as with the beats arg", () => {
      const device = registerSimpler();

      applySpecializedActions(device, ["warpAs(4)"], "updateDevice");

      expect(device.call).toHaveBeenCalledWith("warp_as", 4);
    });

    it("warns when warpAs has a non-numeric arg", () => {
      const device = registerSimpler();

      applySpecializedActions(device, ["warpAs(soon)"], "updateDevice");

      expect(device.call).not.toHaveBeenCalledWith(
        "warp_as",
        expect.anything(),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("warpAs requires a numeric"),
      );
    });
  });
});
