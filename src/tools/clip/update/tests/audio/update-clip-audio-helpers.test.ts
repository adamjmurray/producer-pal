// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAudioTransforms,
  handleWarpMarkerOperation,
  setAudioParameters,
} from "#src/tools/clip/update/helpers/update-clip-audio-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplified mock type
type MockClip = any;

describe("setAudioParameters", () => {
  let mockClip: MockClip;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClip = {
      set: vi.fn(),
      getProperty: vi.fn(),
    };
  });

  it("should set gain when gainDb is provided", () => {
    setAudioParameters(mockClip, { gainDb: 0 });

    // Uses lookup table - 0 dB corresponds to ~0.4 in Live's gain range
    expect(mockClip.set).toHaveBeenCalledWith("gain", expect.any(Number));
    expect(mockClip.set.mock.calls[0]![1]).toBeGreaterThan(0.3);
    expect(mockClip.set.mock.calls[0]![1]).toBeLessThan(0.5);
  });

  it("should set gain for negative dB values", () => {
    setAudioParameters(mockClip, { gainDb: -12 });

    // Uses lookup table for conversion
    expect(mockClip.set).toHaveBeenCalledWith("gain", expect.any(Number));
    expect(mockClip.set.mock.calls[0]![1]).toBeGreaterThan(0);
    expect(mockClip.set.mock.calls[0]![1]).toBeLessThan(0.4);
  });

  it("should set pitchShift with coarse and fine values", () => {
    setAudioParameters(mockClip, { pitchShift: 5.25 });

    expect(mockClip.set).toHaveBeenCalledWith("pitch_coarse", 5);
    expect(mockClip.set).toHaveBeenCalledWith("pitch_fine", 25);
  });

  it("should keep pitch_fine within ±50 for fractions over half a semitone", () => {
    // round(5.75) = 6, fine = round((5.75 - 6) * 100) = -25 → 6 - 0.25 = 5.75.
    // The old Math.floor gave fine = 75, which Live clamps to 50 (→ 5.5).
    setAudioParameters(mockClip, { pitchShift: 5.75 });

    expect(mockClip.set).toHaveBeenCalledWith("pitch_coarse", 6);
    expect(mockClip.set).toHaveBeenCalledWith("pitch_fine", -25);
  });

  it("should set pitchShift with negative values", () => {
    // round(-3.25) = -3, fine = round((-3.25 - -3) * 100) = -25 → -3.25.
    // The old Math.floor gave coarse -4 / fine 75, which Live clamps to 50.
    setAudioParameters(mockClip, { pitchShift: -3.25 });

    expect(mockClip.set).toHaveBeenCalledWith("pitch_coarse", -3);
    expect(mockClip.set).toHaveBeenCalledWith("pitch_fine", -25);
  });

  it("should set pitchShift for whole number negative values", () => {
    setAudioParameters(mockClip, { pitchShift: -3 });

    expect(mockClip.set).toHaveBeenCalledWith("pitch_coarse", -3);
    expect(mockClip.set).toHaveBeenCalledWith("pitch_fine", 0);
  });

  it("should set warpMode to beats", () => {
    setAudioParameters(mockClip, { warpMode: "beats" });

    expect(mockClip.set).toHaveBeenCalledWith("warp_mode", 0);
  });

  it("should set warpMode to tones", () => {
    setAudioParameters(mockClip, { warpMode: "tones" });

    expect(mockClip.set).toHaveBeenCalledWith("warp_mode", 1);
  });

  it("should set warpMode to texture", () => {
    setAudioParameters(mockClip, { warpMode: "texture" });

    expect(mockClip.set).toHaveBeenCalledWith("warp_mode", 2);
  });

  it("should set warpMode to repitch", () => {
    setAudioParameters(mockClip, { warpMode: "repitch" });

    expect(mockClip.set).toHaveBeenCalledWith("warp_mode", 3);
  });

  it("should set warpMode to complex", () => {
    setAudioParameters(mockClip, { warpMode: "complex" });

    expect(mockClip.set).toHaveBeenCalledWith("warp_mode", 4);
  });

  it("should set warpMode to rex", () => {
    setAudioParameters(mockClip, { warpMode: "rex" });

    expect(mockClip.set).toHaveBeenCalledWith("warp_mode", 5);
  });

  it("should set warpMode to pro", () => {
    setAudioParameters(mockClip, { warpMode: "pro" });

    expect(mockClip.set).toHaveBeenCalledWith("warp_mode", 6);
  });

  it("should not set warp_mode for invalid warpMode value", () => {
    setAudioParameters(mockClip, { warpMode: "invalid" });

    expect(mockClip.set).not.toHaveBeenCalledWith(
      "warp_mode",
      expect.anything(),
    );
  });

  it("does not call set at all for an invalid warpMode", () => {
    // Forcing the lookup guard true would call set("warp_mode", undefined) — a
    // call the expect.anything() assertion above cannot catch (undefined is not
    // "anything"). Asserting no set call at all pins it.
    setAudioParameters(mockClip, { warpMode: "invalid" });

    expect(mockClip.set).not.toHaveBeenCalled();
  });

  it("should set warping to 1 when true", () => {
    setAudioParameters(mockClip, { warping: true });

    expect(mockClip.set).toHaveBeenCalledWith("warping", 1);
  });

  it("should set warping to 0 when false", () => {
    mockClip.getProperty = vi.fn((property: string) =>
      property === "warping" ? 1 : undefined,
    );

    setAudioParameters(mockClip, { warping: false });

    expect(mockClip.set).toHaveBeenCalledWith("warping", 0);
  });

  it("restates the end marker in seconds when unwarping, like create-clip", () => {
    // Live rereads end_marker as seconds without converting it, so leaving the
    // warped beat value behind gives `warping: false` a different region here
    // than it produces in create-clip.
    mockClip.getProperty = vi.fn((property: string) =>
      property === "sample_length" ? 115200 : 48000,
    );

    setAudioParameters(mockClip, { warping: false });

    expect(mockClip.set).toHaveBeenCalledWith("warping", 0);
    expect(mockClip.set).toHaveBeenCalledWith("end_marker", 2.4);
  });

  it("leaves an already-unwarped clip alone", () => {
    // Its markers are seconds already. Restating would reset a shorter region
    // to the whole sample, and Live's own conversion is a no-op here too.
    mockClip.getProperty = vi.fn((property: string) =>
      property === "warping" ? 0 : 48000,
    );

    setAudioParameters(mockClip, { warping: false });

    expect(mockClip.set).not.toHaveBeenCalled();
  });

  it("should not set any properties when no parameters provided", () => {
    setAudioParameters(mockClip, {});

    expect(mockClip.set).not.toHaveBeenCalled();
  });

  it("should set multiple parameters at once", () => {
    setAudioParameters(mockClip, {
      gainDb: 6,
      pitchShift: 2,
      warpMode: "complex",
      warping: true,
    });

    expect(mockClip.set).toHaveBeenCalledWith("gain", expect.any(Number));
    expect(mockClip.set).toHaveBeenCalledWith("pitch_coarse", 2);
    expect(mockClip.set).toHaveBeenCalledWith("pitch_fine", 0);
    expect(mockClip.set).toHaveBeenCalledWith("warp_mode", 4);
    expect(mockClip.set).toHaveBeenCalledWith("warping", 1);
  });
});

describe("applyAudioTransforms", () => {
  let mockClip: MockClip;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClip = {
      getProperty: vi.fn(),
      set: vi.fn(),
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
    expect(mockClip.set).toHaveBeenCalledWith("gain", expect.any(Number));
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
    expect(mockClip.set).not.toHaveBeenCalled();
  });

  it("should apply pitchShift transform and return true", () => {
    mockClip.getProperty.mockImplementation((prop: string) => {
      if (prop === "gain") return 0.4;
      if (prop === "pitch_coarse") return 0;
      if (prop === "pitch_fine") return 0;

      return null;
    });

    const result = applyAudioTransforms(mockClip, "pitchShift = 5.25");

    expect(result).toBe(true);
    expect(mockClip.set).toHaveBeenCalledWith("pitch_coarse", 5);
    expect(mockClip.set).toHaveBeenCalledWith("pitch_fine", 25);
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
    expect(mockClip.set).not.toHaveBeenCalled();
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
    expect(mockClip.set).toHaveBeenCalledWith("gain", expect.any(Number));
    expect(mockClip.set).toHaveBeenCalledWith("pitch_coarse", 5);
    expect(mockClip.set).toHaveBeenCalledWith("pitch_fine", 0);
  });

  it("reads currentPitchShift as coarse + fine/100 (exact arithmetic)", () => {
    // pitch_coarse 3 + pitch_fine 50/100 = 3.5. Setting pitchShift to exactly
    // 3.5 is therefore a no-op → returns false. A `-` (→ 2.5) or `* 100`
    // (→ 5003) mutation of the currentPitchShift formula makes 3.5 look like a
    // change and would write pitch_coarse.
    mockClip.getProperty.mockImplementation((prop: string) => {
      if (prop === "gain") return 0.4;
      if (prop === "pitch_coarse") return 3;
      if (prop === "pitch_fine") return 50;

      return null;
    });

    const result = applyAudioTransforms(mockClip, "pitchShift = 3.5");

    expect(result).toBe(false);
    expect(mockClip.set).not.toHaveBeenCalledWith(
      "pitch_coarse",
      expect.anything(),
    );
  });
});

describe("handleWarpMarkerOperation", () => {
  let mockClip: MockClip;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClip = {
      id: "123",
      call: vi.fn(),
      getProperty: vi.fn(),
    };
    mockClip.call.mockReturnValue(true);
  });

  it("should warn and skip when clip is not an audio clip", () => {
    mockClip.getProperty.mockReturnValue(null);

    // Should not throw, just warn and return early
    handleWarpMarkerOperation(mockClip, "add", 1.0, 44100);

    expect(mockClip.call).not.toHaveBeenCalled();
  });

  it("should warn and skip when warpBeatTime is not provided", () => {
    mockClip.getProperty.mockReturnValue("/path/to/audio.wav");

    // Should not throw, just warn and return early
    handleWarpMarkerOperation(mockClip, "add", undefined, 44100);

    expect(mockClip.call).not.toHaveBeenCalled();
  });

  it("warns with the audio-clip message when the clip has no file", () => {
    // Pins the actual warning text so a blanked string literal is caught.
    mockClip.getProperty.mockReturnValue(null);

    handleWarpMarkerOperation(mockClip, "add", 1.0, 44100);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("warp markers only available on audio clips"),
    );
  });

  it("reads file_path specifically to detect an audio clip", () => {
    // Only "file_path" yields a path; any other key (e.g. the "" a
    // string-literal mutation would read) returns null → treated as non-audio,
    // which would warn-and-skip instead of performing the operation.
    mockClip.getProperty.mockImplementation((prop: string) =>
      prop === "file_path" ? "/path/to/audio.wav" : null,
    );

    handleWarpMarkerOperation(mockClip, "remove", 4.0);

    expect(mockClip.call).toHaveBeenCalledWith("remove_warp_marker", 4.0);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("warp markers only available"),
    );
  });

  it("warns with the warpBeatTime message when it is missing", () => {
    mockClip.getProperty.mockReturnValue("/path/to/audio.wav");

    handleWarpMarkerOperation(mockClip, "add", undefined, 44100);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("warpBeatTime required for"),
    );
  });

  describe("add operation", () => {
    beforeEach(() => {
      mockClip.getProperty.mockReturnValue("/path/to/audio.wav");
    });

    it("should add warp marker with sample time", () => {
      handleWarpMarkerOperation(mockClip, "add", 4.0, 88200);

      expect(mockClip.call).toHaveBeenCalledWith("add_warp_marker", {
        beat_time: 4.0,
        sample_time: 88200,
      });
    });

    it("should add warp marker without sample time", () => {
      handleWarpMarkerOperation(mockClip, "add", 4.0, undefined);

      expect(mockClip.call).toHaveBeenCalledWith("add_warp_marker", {
        beat_time: 4.0,
      });
    });

    it("omits the sample_time key entirely when warpSampleTime is undefined", () => {
      // toHaveBeenCalledWith treats { beat_time } and { beat_time, sample_time:
      // undefined } as equal, so it can't catch the ternary being forced true.
      // Inspect the args object for the key's presence directly.
      handleWarpMarkerOperation(mockClip, "add", 4.0, undefined);

      const addCall = mockClip.call.mock.calls.find(
        (c: unknown[]) => c[0] === "add_warp_marker",
      );

      expect(addCall?.[1]).not.toHaveProperty("sample_time");
    });
  });

  describe("move operation", () => {
    beforeEach(() => {
      mockClip.getProperty.mockReturnValue("/path/to/audio.wav");
    });

    it("should warn and skip when warpDistance is not provided", () => {
      // Should not throw, just warn and return early
      handleWarpMarkerOperation(mockClip, "move", 4.0, undefined, undefined);

      expect(mockClip.call).not.toHaveBeenCalled();
    });

    it("warns with the warpDistance message when it is missing", () => {
      // Pins the actual warning text so a blanked string literal is caught.
      handleWarpMarkerOperation(mockClip, "move", 4.0, undefined, undefined);

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("warpDistance required for move"),
      );
    });

    it("should move warp marker by specified distance", () => {
      handleWarpMarkerOperation(mockClip, "move", 4.0, undefined, 0.5);

      expect(mockClip.call).toHaveBeenCalledWith("move_warp_marker", 4.0, 0.5);
    });

    it("should move warp marker with negative distance", () => {
      handleWarpMarkerOperation(mockClip, "move", 8.0, undefined, -1.0);

      expect(mockClip.call).toHaveBeenCalledWith("move_warp_marker", 8.0, -1.0);
    });
  });

  describe("remove operation", () => {
    beforeEach(() => {
      mockClip.getProperty.mockReturnValue("/path/to/audio.wav");
    });

    it("should remove warp marker at specified beat time", () => {
      handleWarpMarkerOperation(mockClip, "remove", 4.0);

      expect(mockClip.call).toHaveBeenCalledWith("remove_warp_marker", 4.0);
    });
  });
});
