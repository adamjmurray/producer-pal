import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveAPI as MockLiveAPI,
  liveApiCall,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";
import {
  adjustClipPreRoll,
  createShortenedClipInHolding,
  moveClipFromHolding,
} from "./arrangement-tiling.js";

// Mock context for tests
const mockContext = {
  silenceWavPath: "/tmp/test-silence.wav",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createShortenedClipInHolding", () => {
  it("duplicates clip to holding area and shortens to target length", () => {
    const sourceClip = MockLiveAPI.from("id 100");

    const track = MockLiveAPI.from("live_set tracks 0");

    // Mock track.call for duplicate_clip_to_arrangement
    liveApiCall.mockReturnValueOnce(["id", "200"]); // Returns holding clip

    // Mock holding clip properties
    mockLiveApiGet({
      "id 200": {
        end_time: 1000 + 16, // holdingAreaStart (1000) + clip length (16)
      },
    });

    // Mock track.call for create_midi_clip (temp clip)
    liveApiCall.mockReturnValueOnce(["id", "300"]); // Returns temp clip

    const result = createShortenedClipInHolding(
      sourceClip as unknown as LiveAPI,
      track as unknown as LiveAPI,
      8,
      1000,
      true,
      mockContext,
    );

    // Verify duplicate_clip_to_arrangement was called correctly
    expect(liveApiCall).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 100",
      1000,
    );

    // Verify temp clip creation for shortening
    expect(liveApiCall).toHaveBeenNthCalledWith(2, "create_midi_clip", 1008, 8);

    // Verify temp clip deletion
    expect(liveApiCall).toHaveBeenNthCalledWith(3, "delete_clip", "id 300");

    // Verify return value
    expect(result).toStrictEqual({
      holdingClipId: "200",
      holdingClip: expect.any(MockLiveAPI),
    });
    expect(result.holdingClip.id).toBe("200");
  });

  it("calculates temp clip length correctly for different target lengths", () => {
    const sourceClip = MockLiveAPI.from("id 100");

    const track = MockLiveAPI.from("live_set tracks 0");

    liveApiCall.mockReturnValueOnce(["id", "200"]); // Holding clip

    mockLiveApiGet({
      "id 200": {
        end_time: 2000 + 32, // Original clip is 32 beats
      },
    });

    liveApiCall.mockReturnValueOnce(["id", "300"]); // Temp clip

    createShortenedClipInHolding(
      sourceClip as unknown as LiveAPI,
      track as unknown as LiveAPI,
      12,
      2000,
      true,
      mockContext,
    );

    // Target length 12, original 32, so temp clip should be 20 beats
    expect(liveApiCall).toHaveBeenNthCalledWith(
      2,
      "create_midi_clip",
      2012,
      20,
    );
  });

  it("creates audio clip in session for audio clip shortening", () => {
    const sourceClip = MockLiveAPI.from("id 100");
    const track = MockLiveAPI.from("live_set tracks 0");

    // Mock duplicate_clip_to_arrangement (holding clip)
    liveApiCall.mockReturnValueOnce(["id", "200"]);

    // Mock holding clip properties - last scene is EMPTY (simplified test)
    mockLiveApiGet({
      "id 200": {
        end_time: 1000 + 16, // holdingAreaStart (1000) + clip length (16)
      },
      live_set: {
        scenes: ["id", "1", "id", "2"],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      "id 1": {},
      "id 2": {
        is_empty: 1, // Empty - will use this scene
      },
      "id 400": {
        // Session clip properties after creation
      },
      "live_set/tracks/0/clip_slots/1/clip": {
        // Session clip created via path (sceneIndex is 1 for last scene)
      },
      "id 500": {
        // Temp clip properties
      },
    });

    // Mock create_audio_clip in session
    liveApiCall.mockReturnValueOnce(["id", "400"]);

    // Mock duplicate_clip_to_arrangement for temp clip
    liveApiCall.mockReturnValueOnce(["id", "500"]);

    const result = createShortenedClipInHolding(
      sourceClip as unknown as LiveAPI,
      track as unknown as LiveAPI,
      8,
      1000,
      false, // isMidiClip=false means audio clip
      mockContext,
    );

    // Verify call sequence
    expect(liveApiCall).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement", // Source to holding
      "id 100",
      1000,
    );

    expect(liveApiCall).toHaveBeenNthCalledWith(
      2,
      "create_audio_clip", // Session clip creation
      "/tmp/test-silence.wav",
    );

    // Verify session clip was set up with warping and looping
    const sessionClip = MockLiveAPI.from("id 400");

    expect(sessionClip.set).toHaveBeenCalledWith("warping", 1);
    expect(sessionClip.set).toHaveBeenCalledWith("looping", 1);
    expect(sessionClip.set).toHaveBeenCalledWith("loop_end", 8);

    expect(liveApiCall).toHaveBeenNthCalledWith(
      3,
      "duplicate_clip_to_arrangement", // Session to arrangement temp clip
      "id live_set/tracks/0/clip_slots/1/clip", // Path-based ID (sceneIndex 1)
      1008,
    );

    expect(liveApiCall).toHaveBeenNthCalledWith(4, "delete_clip"); // Session slot
    expect(liveApiCall).toHaveBeenNthCalledWith(5, "delete_clip", "id 500"); // Temp clip

    // Verify return value
    expect(result).toStrictEqual({
      holdingClipId: "200",
      holdingClip: expect.any(MockLiveAPI),
    });
  });
});

describe("moveClipFromHolding", () => {
  it("duplicates holding clip to target position and cleans up", () => {
    const track = MockLiveAPI.from("live_set tracks 0");

    // Mock track.call for duplicate_clip_to_arrangement
    liveApiCall.mockReturnValueOnce(["id", "400"]); // Returns moved clip

    const result = moveClipFromHolding("200", track as unknown as LiveAPI, 500);

    // Verify duplicate to target position
    expect(liveApiCall).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 200",
      500,
    );

    // Verify holding clip cleanup
    expect(liveApiCall).toHaveBeenNthCalledWith(2, "delete_clip", "id 200");

    // Verify return value
    expect(result).toBeInstanceOf(MockLiveAPI);
    expect(result.id).toBe("400");
  });

  it("works with different holding clip IDs and positions", () => {
    const track = MockLiveAPI.from("live_set tracks 2");

    liveApiCall.mockReturnValueOnce(["id", "999"]);

    moveClipFromHolding("777", track as unknown as LiveAPI, 1234);

    expect(liveApiCall).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 777",
      1234,
    );
    expect(liveApiCall).toHaveBeenNthCalledWith(2, "delete_clip", "id 777");
  });
});

describe("adjustClipPreRoll", () => {
  it("does nothing when clip has no pre-roll (start_marker >= loop_start)", () => {
    const clip = MockLiveAPI.from("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 4,
        loop_start: 4,
      },
    });

    const track = MockLiveAPI.from("live_set tracks 0");

    adjustClipPreRoll(
      clip as unknown as LiveAPI,
      track as unknown as LiveAPI,
      true,
      mockContext,
    );

    // No calls should be made
    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("does nothing when start_marker > loop_start", () => {
    const clip = MockLiveAPI.from("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 8,
        loop_start: 4,
      },
    });

    const track = MockLiveAPI.from("live_set tracks 0");

    adjustClipPreRoll(
      clip as unknown as LiveAPI,
      track as unknown as LiveAPI,
      true,
      mockContext,
    );

    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("adjusts start_marker and shortens clip when pre-roll exists", () => {
    const clip = MockLiveAPI.from("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 2,
        loop_start: 6,
        end_time: 100,
      },
    });

    const track = MockLiveAPI.from("live_set tracks 0");

    liveApiCall.mockReturnValueOnce(["id", "300"]); // Temp clip

    adjustClipPreRoll(
      clip as unknown as LiveAPI,
      track as unknown as LiveAPI,
      true,
      mockContext,
    );

    // Verify start_marker set to loop_start
    expect(clip.set).toHaveBeenCalledWith("start_marker", 6);

    // Pre-roll is 4 beats (6 - 2), so clip should be shortened by 4
    // New end_time = 100 - 4 = 96
    // Temp clip at 96 with length 4
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "create_midi_clip", 96, 4);

    // Verify temp clip deletion
    expect(liveApiCall).toHaveBeenNthCalledWith(2, "delete_clip", "id 300");
  });

  it("handles different pre-roll amounts correctly", () => {
    const clip = MockLiveAPI.from("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 0,
        loop_start: 8,
        end_time: 200,
      },
    });

    const track = MockLiveAPI.from("live_set tracks 1");

    liveApiCall.mockReturnValueOnce(["id", "400"]);

    adjustClipPreRoll(
      clip as unknown as LiveAPI,
      track as unknown as LiveAPI,
      true,
      mockContext,
    );

    expect(clip.set).toHaveBeenCalledWith("start_marker", 8);

    // Pre-roll is 8 beats, new end = 192, temp clip length = 8
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "create_midi_clip", 192, 8);
  });

  it("adjusts audio clip with pre-roll using session view workflow", () => {
    const clip = MockLiveAPI.from("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 2,
        loop_start: 6,
        end_time: 100,
      },
      live_set: {
        scenes: ["id", "500"],
      },
      "id 500": {
        is_empty: 1,
      },
      "live_set tracks 0 clip_slots 0": {},
      "live_set tracks 0 clip_slots 0 clip": {},
    });

    const track = MockLiveAPI.from("live_set tracks 0");

    // Mock return values in sequence:
    // 1. create_audio_clip (return value not used)
    // 2. duplicate_clip_to_arrangement (creates temp clip with id 800)
    liveApiCall
      .mockReturnValueOnce(undefined) // create_audio_clip
      .mockReturnValueOnce(["id", "800"]); // duplicate_clip_to_arrangement

    adjustClipPreRoll(
      clip as unknown as LiveAPI,
      track as unknown as LiveAPI,
      false,
      mockContext,
    );

    // Verify start_marker set to loop_start
    expect(clip.set).toHaveBeenCalledWith("start_marker", 6);

    // Verify audio clip creation in session slot (only takes file path)
    expect(liveApiCall).toHaveBeenCalledWith(
      "create_audio_clip",
      "/tmp/test-silence.wav",
    );

    // Verify duplicate to arrangement at newClipEnd (96 = 100 - 4)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.stringContaining("clip_slots"),
      96,
    );

    // Verify cleanup: delete session clip and temp arrangement clip
    expect(liveApiCall).toHaveBeenCalledWith("delete_clip");
    expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id 800");
  });
});
