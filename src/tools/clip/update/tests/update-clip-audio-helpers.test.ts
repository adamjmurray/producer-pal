import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiSet,
} from "#src/test/mocks/mock-live-api.js";
import * as arrangementTiling from "#src/tools/shared/arrangement/arrangement-tiling.js";
import {
  handleWarpMarkerOperation,
  revealAudioContentAtPosition,
  setAudioParameters,
} from "#src/tools/clip/update/helpers/update-clip-audio-helpers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplified mock type
type MockClip = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplified mock type
type MockTrack = any;

describe("setAudioParameters", () => {
  let mockClip: MockClip;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClip = {
      set: liveApiSet,
      get: liveApiGet,
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

describe("revealAudioContentAtPosition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle warped clips with looping workaround", () => {
    const sourceClip: MockClip = {
      id: "source-123",
      getProperty: vi.fn((prop) => {
        if (prop === "warping") return 1;

        return null;
      }),
    };

    const mockTrack: MockTrack = {
      call: liveApiCall,
    };

    const revealedClipId = "revealed-456";

    liveApiCall.mockReturnValue(`id ${revealedClipId}`);

    const result = revealAudioContentAtPosition(
      sourceClip,
      mockTrack,
      4, // newStartMarker
      12, // newEndMarker
      16, // targetPosition
      {},
    );

    // Should duplicate to arrangement
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id source-123",
      16,
    );

    // Should set looping markers
    expect(liveApiSet).toHaveBeenCalledWith("looping", 1);
    expect(liveApiSet).toHaveBeenCalledWith("loop_end", 12);
    expect(liveApiSet).toHaveBeenCalledWith("loop_start", 4);
    expect(liveApiSet).toHaveBeenCalledWith("end_marker", 12);
    expect(liveApiSet).toHaveBeenCalledWith("start_marker", 4);
    expect(liveApiSet).toHaveBeenCalledWith("looping", 0);

    expect(result).toBeDefined();
  });

  it("should handle unwarped clips with session holding area", () => {
    const sourceClip: MockClip = {
      id: "source-123",
      getProperty: vi.fn((prop) => {
        if (prop === "warping") return 0; // Unwarped
        if (prop === "file_path") return "/audio/test.wav";

        return null;
      }),
    };

    const mockTrack: MockTrack = {
      call: liveApiCall,
    };

    const sessionClipId = "session-789";
    const revealedClipId = "revealed-456";

    // Mock createAudioClipInSession - clip needs a set method
    const mockCreateAudioClip = vi
      .spyOn(arrangementTiling, "createAudioClipInSession")
      .mockReturnValue({
        clip: { id: sessionClipId, set: vi.fn() } as unknown as LiveAPI,
        slot: { call: vi.fn() } as unknown as LiveAPI,
      });

    liveApiCall.mockReturnValue(`id ${revealedClipId}`);
    liveApiGet.mockImplementation(function (prop: string) {
      if (prop === "end_time") return [24]; // Within expected bounds

      return null;
    });

    const result = revealAudioContentAtPosition(
      sourceClip,
      mockTrack,
      4, // newStartMarker
      12, // newEndMarker
      16, // targetPosition
      {},
    );

    // Should create audio clip in session
    expect(mockCreateAudioClip).toHaveBeenCalledWith(
      mockTrack,
      12, // newEndMarker
      "/audio/test.wav",
    );

    expect(result).toBeDefined();

    mockCreateAudioClip.mockRestore();
  });

  it("should shorten revealed clip when it is longer than expected", () => {
    const sourceClip: MockClip = {
      id: "source-123",
      getProperty: vi.fn((prop) => {
        if (prop === "warping") return 0; // Unwarped
        if (prop === "file_path") return "/audio/test.wav";

        return null;
      }),
    };

    const mockTrack: MockTrack = {
      call: liveApiCall,
    };

    const sessionClipId = "session-789";
    const revealedClipId = "revealed-456";
    const shortenerId = "shortener-111";

    // Mock createAudioClipInSession - clip needs a set method
    const mockCreateAudioClip = vi
      .spyOn(arrangementTiling, "createAudioClipInSession")
      .mockReturnValue({
        clip: { id: sessionClipId, set: vi.fn() } as unknown as LiveAPI,
        slot: { call: vi.fn() } as unknown as LiveAPI,
      });

    let callCount = 0;

    liveApiCall.mockImplementation((method) => {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;

        if (callCount === 1) return `id ${revealedClipId}`;

        return `id ${shortenerId}`;
      }

      return null;
    });

    // Make the revealed clip longer than expected to trigger shortening
    // targetPosition (16) + targetLengthBeats (8) = 24
    // revealedClipEndTime = 30 > expectedEndTime (24) + EPSILON
    liveApiGet.mockImplementation(function (prop: string) {
      // getProperty calls get()?.[0], so return array
      if (prop === "end_time") return [30]; // Longer than expected (24)

      return null;
    });

    const result = revealAudioContentAtPosition(
      sourceClip,
      mockTrack,
      4, // newStartMarker
      12, // newEndMarker (targetLengthBeats = 12 - 4 = 8)
      16, // targetPosition
      {},
    );

    // Should create temp shortener clip
    // Called twice: once for temp clip and once for shortener
    expect(mockCreateAudioClip).toHaveBeenCalledTimes(2);

    // Should delete the shortener clip
    expect(liveApiCall).toHaveBeenCalledWith(
      "delete_clip",
      `id ${shortenerId}`,
    );

    expect(result).toBeDefined();

    mockCreateAudioClip.mockRestore();
  });
});
