// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiSet } from "#src/test/mocks/mock-live-api.ts";
import {
  applyAudioTransforms,
  handleWarpMarkerOperation,
  setAudioParameters,
} from "#src/tools/clip/update/helpers/update-clip-audio-helpers.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplified mock type
type MockClip = any;

describe("setAudioParameters", () => {
  let mockClip: MockClip;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClip = {
      set: liveApiSet,
    };
  });

  it("should set gain when gainDb is provided", () => {
    setAudioParameters(mockClip, { gainDb: 0 });

    // Uses lookup table - 0 dB corresponds to ~0.4 in Live's gain range
    expect(liveApiSet).toHaveBeenCalledWith("gain", expect.any(Number));
    expect(liveApiSet.mock.calls[0]![1]).toBeGreaterThan(0.3);
    expect(liveApiSet.mock.calls[0]![1]).toBeLessThan(0.5);
  });

  it("should set gain for negative dB values", () => {
    setAudioParameters(mockClip, { gainDb: -12 });

    // Uses lookup table for conversion
    expect(liveApiSet).toHaveBeenCalledWith("gain", expect.any(Number));
    expect(liveApiSet.mock.calls[0]![1]).toBeGreaterThan(0);
    expect(liveApiSet.mock.calls[0]![1]).toBeLessThan(0.4);
  });

  it("should set pitchShift with coarse and fine values", () => {
    setAudioParameters(mockClip, { pitchShift: 5.5 });

    expect(liveApiSet).toHaveBeenCalledWith("pitch_coarse", 5);
    expect(liveApiSet).toHaveBeenCalledWith("pitch_fine", 50);
  });

  it("should set pitchShift with negative values", () => {
    // Math.floor(-3.25) = -4, fine = round((-3.25 - -4) * 100) = round(0.75 * 100) = 75
    setAudioParameters(mockClip, { pitchShift: -3.25 });

    expect(liveApiSet).toHaveBeenCalledWith("pitch_coarse", -4);
    expect(liveApiSet).toHaveBeenCalledWith("pitch_fine", 75);
  });

  it("should set pitchShift for whole number negative values", () => {
    setAudioParameters(mockClip, { pitchShift: -3 });

    expect(liveApiSet).toHaveBeenCalledWith("pitch_coarse", -3);
    expect(liveApiSet).toHaveBeenCalledWith("pitch_fine", 0);
  });

  it("should set warpMode to beats", () => {
    setAudioParameters(mockClip, { warpMode: "beats" });

    expect(liveApiSet).toHaveBeenCalledWith("warp_mode", 0);
  });

  it("should set warpMode to tones", () => {
    setAudioParameters(mockClip, { warpMode: "tones" });

    expect(liveApiSet).toHaveBeenCalledWith("warp_mode", 1);
  });

  it("should set warpMode to texture", () => {
    setAudioParameters(mockClip, { warpMode: "texture" });

    expect(liveApiSet).toHaveBeenCalledWith("warp_mode", 2);
  });

  it("should set warpMode to repitch", () => {
    setAudioParameters(mockClip, { warpMode: "repitch" });

    expect(liveApiSet).toHaveBeenCalledWith("warp_mode", 3);
  });

  it("should set warpMode to complex", () => {
    setAudioParameters(mockClip, { warpMode: "complex" });

    expect(liveApiSet).toHaveBeenCalledWith("warp_mode", 4);
  });

  it("should set warpMode to rex", () => {
    setAudioParameters(mockClip, { warpMode: "rex" });

    expect(liveApiSet).toHaveBeenCalledWith("warp_mode", 5);
  });

  it("should set warpMode to pro", () => {
    setAudioParameters(mockClip, { warpMode: "pro" });

    expect(liveApiSet).toHaveBeenCalledWith("warp_mode", 6);
  });

  it("should not set warp_mode for invalid warpMode value", () => {
    setAudioParameters(mockClip, { warpMode: "invalid" });

    expect(liveApiSet).not.toHaveBeenCalledWith("warp_mode", expect.anything());
  });

  it("should set warping to 1 when true", () => {
    setAudioParameters(mockClip, { warping: true });

    expect(liveApiSet).toHaveBeenCalledWith("warping", 1);
  });

  it("should set warping to 0 when false", () => {
    setAudioParameters(mockClip, { warping: false });

    expect(liveApiSet).toHaveBeenCalledWith("warping", 0);
  });

  it("should not set any properties when no parameters provided", () => {
    setAudioParameters(mockClip, {});

    expect(liveApiSet).not.toHaveBeenCalled();
  });

  it("should set multiple parameters at once", () => {
    setAudioParameters(mockClip, {
      gainDb: 6,
      pitchShift: 2,
      warpMode: "complex",
      warping: true,
    });

    expect(liveApiSet).toHaveBeenCalledWith("gain", expect.any(Number));
    expect(liveApiSet).toHaveBeenCalledWith("pitch_coarse", 2);
    expect(liveApiSet).toHaveBeenCalledWith("pitch_fine", 0);
    expect(liveApiSet).toHaveBeenCalledWith("warp_mode", 4);
    expect(liveApiSet).toHaveBeenCalledWith("warping", 1);
  });
});

describe("applyAudioTransforms", () => {
  let mockClip: MockClip;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClip = {
      getProperty: vi.fn(),
      set: liveApiSet,
    };
  });

  it("should return false when no transform string provided", () => {
    const result = applyAudioTransforms(mockClip, undefined);

    expect(result).toBe(false);
    expect(mockClip.getProperty).not.toHaveBeenCalled();
  });

  it("should return false when transform string is empty", () => {
    const result = applyAudioTransforms(mockClip, "");

    expect(result).toBe(false);
    expect(mockClip.getProperty).not.toHaveBeenCalled();
  });

  it("should apply gain transform and return true", () => {
    // Live gain 0.4 ≈ 0 dB
    mockClip.getProperty.mockReturnValue(0.4);

    const result = applyAudioTransforms(mockClip, "gain = -6");

    expect(result).toBe(true);
    expect(mockClip.getProperty).toHaveBeenCalledWith("gain");
    expect(liveApiSet).toHaveBeenCalledWith("gain", expect.any(Number));
  });

  it("should return false when gain is unchanged", () => {
    // Live gain ~0.4 ≈ 0 dB, transform sets to 0 dB
    mockClip.getProperty.mockReturnValue(0.4);

    const result = applyAudioTransforms(mockClip, "gain = audio.gain");

    expect(result).toBe(false);
  });

  it("should return false when only MIDI parameters present", () => {
    mockClip.getProperty.mockReturnValue(0.4);

    const result = applyAudioTransforms(mockClip, "velocity += 10");

    expect(result).toBe(false);
    // Note: getProperty is still called to read current gain before checking transforms
    expect(liveApiSet).not.toHaveBeenCalled();
  });

  it("should apply pitchShift transform and return true", () => {
    mockClip.getProperty.mockImplementation((prop: string) => {
      if (prop === "gain") return 0.4;
      if (prop === "pitch_coarse") return 0;
      if (prop === "pitch_fine") return 0;

      return null;
    });

    const result = applyAudioTransforms(mockClip, "pitchShift = 5.5");

    expect(result).toBe(true);
    expect(liveApiSet).toHaveBeenCalledWith("pitch_coarse", 5);
    expect(liveApiSet).toHaveBeenCalledWith("pitch_fine", 50);
  });

  it("should return false when pitchShift is unchanged", () => {
    mockClip.getProperty.mockImplementation((prop: string) => {
      if (prop === "gain") return 0.4;
      if (prop === "pitch_coarse") return 5;
      if (prop === "pitch_fine") return 0;

      return null;
    });

    // Current pitchShift is 5.0, set to same value
    const result = applyAudioTransforms(
      mockClip,
      "pitchShift = audio.pitchShift",
    );

    expect(result).toBe(false);
    expect(liveApiSet).not.toHaveBeenCalled();
  });

  it("should apply both gain and pitchShift transforms", () => {
    mockClip.getProperty.mockImplementation((prop: string) => {
      if (prop === "gain") return 0.4;
      if (prop === "pitch_coarse") return 0;
      if (prop === "pitch_fine") return 0;

      return null;
    });

    const result = applyAudioTransforms(mockClip, "gain = -6\npitchShift = 5");

    expect(result).toBe(true);
    expect(liveApiSet).toHaveBeenCalledWith("gain", expect.any(Number));
    expect(liveApiSet).toHaveBeenCalledWith("pitch_coarse", 5);
    expect(liveApiSet).toHaveBeenCalledWith("pitch_fine", 0);
  });
});

describe("handleWarpMarkerOperation", () => {
  let mockClip: MockClip;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClip = {
      id: "123",
      call: liveApiCall,
      getProperty: vi.fn(),
    };
    liveApiCall.mockReturnValue(true);
  });

  it("should warn and skip when clip is not an audio clip", () => {
    mockClip.getProperty.mockReturnValue(null);

    // Should not throw, just warn and return early
    handleWarpMarkerOperation(mockClip, "add", 1.0, 44100);

    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("should warn and skip when warpBeatTime is not provided", () => {
    mockClip.getProperty.mockReturnValue("/path/to/audio.wav");

    // Should not throw, just warn and return early
    handleWarpMarkerOperation(mockClip, "add", undefined, 44100);

    expect(liveApiCall).not.toHaveBeenCalled();
  });

  describe("add operation", () => {
    beforeEach(() => {
      mockClip.getProperty.mockReturnValue("/path/to/audio.wav");
    });

    it("should add warp marker with sample time", () => {
      handleWarpMarkerOperation(mockClip, "add", 4.0, 88200);

      expect(liveApiCall).toHaveBeenCalledWith("add_warp_marker", {
        beat_time: 4.0,
        sample_time: 88200,
      });
    });

    it("should add warp marker without sample time", () => {
      handleWarpMarkerOperation(mockClip, "add", 4.0, undefined);

      expect(liveApiCall).toHaveBeenCalledWith("add_warp_marker", {
        beat_time: 4.0,
      });
    });
  });

  describe("move operation", () => {
    beforeEach(() => {
      mockClip.getProperty.mockReturnValue("/path/to/audio.wav");
    });

    it("should warn and skip when warpDistance is not provided", () => {
      // Should not throw, just warn and return early
      handleWarpMarkerOperation(mockClip, "move", 4.0, undefined, undefined);

      expect(liveApiCall).not.toHaveBeenCalled();
    });

    it("should move warp marker by specified distance", () => {
      handleWarpMarkerOperation(mockClip, "move", 4.0, undefined, 0.5);

      expect(liveApiCall).toHaveBeenCalledWith("move_warp_marker", 4.0, 0.5);
    });

    it("should move warp marker with negative distance", () => {
      handleWarpMarkerOperation(mockClip, "move", 8.0, undefined, -1.0);

      expect(liveApiCall).toHaveBeenCalledWith("move_warp_marker", 8.0, -1.0);
    });
  });

  describe("remove operation", () => {
    beforeEach(() => {
      mockClip.getProperty.mockReturnValue("/path/to/audio.wav");
    });

    it("should remove warp marker at specified beat time", () => {
      handleWarpMarkerOperation(mockClip, "remove", 4.0);

      expect(liveApiCall).toHaveBeenCalledWith("remove_warp_marker", 4.0);
    });
  });
});
