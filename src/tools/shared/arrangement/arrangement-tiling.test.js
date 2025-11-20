import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveAPI,
  liveApiCall,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import {
  adjustClipPreRoll,
  createPartialTile,
  createShortenedClipInHolding,
  moveClipFromHolding,
  tileClipToRange,
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
    const sourceClip = new LiveAPI("id 100");

    const track = new LiveAPI("live_set tracks 0");

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
      sourceClip,
      track,
      8,
      1000,
      true,
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
    expect(result).toEqual({
      holdingClipId: "200",
      holdingClip: expect.any(LiveAPI),
    });
    expect(result.holdingClip.id).toBe("200");
  });

  it("calculates temp clip length correctly for different target lengths", () => {
    const sourceClip = new LiveAPI("id 100");

    const track = new LiveAPI("live_set tracks 0");

    liveApiCall.mockReturnValueOnce(["id", "200"]); // Holding clip

    mockLiveApiGet({
      "id 200": {
        end_time: 2000 + 32, // Original clip is 32 beats
      },
    });

    liveApiCall.mockReturnValueOnce(["id", "300"]); // Temp clip

    createShortenedClipInHolding(sourceClip, track, 12, 2000, true);

    // Target length 12, original 32, so temp clip should be 20 beats
    expect(liveApiCall).toHaveBeenNthCalledWith(
      2,
      "create_midi_clip",
      2012,
      20,
    );
  });

  it("creates audio clip in session for audio clip shortening", () => {
    const sourceClip = new LiveAPI("id 100");
    const track = new LiveAPI("live_set tracks 0");

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
      sourceClip,
      track,
      8,
      1000,
      false, // isAudioClip
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
    const sessionClip = new LiveAPI("id 400");
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
    expect(result).toEqual({
      holdingClipId: "200",
      holdingClip: expect.any(LiveAPI),
    });
  });
});

describe("moveClipFromHolding", () => {
  it("duplicates holding clip to target position and cleans up", () => {
    const track = new LiveAPI("live_set tracks 0");

    // Mock track.call for duplicate_clip_to_arrangement
    liveApiCall.mockReturnValueOnce(["id", "400"]); // Returns moved clip

    const result = moveClipFromHolding("200", track, 500);

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
    expect(result).toBeInstanceOf(LiveAPI);
    expect(result.id).toBe("400");
  });

  it("works with different holding clip IDs and positions", () => {
    const track = new LiveAPI("live_set tracks 2");

    liveApiCall.mockReturnValueOnce(["id", "999"]);

    moveClipFromHolding("777", track, 1234);

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
    const clip = new LiveAPI("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 4,
        loop_start: 4,
      },
    });

    const track = new LiveAPI("live_set tracks 0");

    adjustClipPreRoll(clip, track, true);

    // No calls should be made
    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("does nothing when start_marker > loop_start", () => {
    const clip = new LiveAPI("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 8,
        loop_start: 4,
      },
    });

    const track = new LiveAPI("live_set tracks 0");

    adjustClipPreRoll(clip, track, true);

    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("adjusts start_marker and shortens clip when pre-roll exists", () => {
    const clip = new LiveAPI("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 2,
        loop_start: 6,
        end_time: 100,
      },
    });

    const track = new LiveAPI("live_set tracks 0");

    liveApiCall.mockReturnValueOnce(["id", "300"]); // Temp clip

    adjustClipPreRoll(clip, track, true);

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
    const clip = new LiveAPI("id 100");

    mockLiveApiGet({
      "id 100": {
        start_marker: 0,
        loop_start: 8,
        end_time: 200,
      },
    });

    const track = new LiveAPI("live_set tracks 1");

    liveApiCall.mockReturnValueOnce(["id", "400"]);

    adjustClipPreRoll(clip, track, true);

    expect(clip.set).toHaveBeenCalledWith("start_marker", 8);

    // Pre-roll is 8 beats, new end = 192, temp clip length = 8
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "create_midi_clip", 192, 8);
  });

  it("adjusts audio clip with pre-roll using session view workflow", () => {
    const clip = new LiveAPI("id 100");

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

    const track = new LiveAPI("live_set tracks 0");

    // Mock return values in sequence:
    // 1. create_audio_clip (return value not used)
    // 2. duplicate_clip_to_arrangement (creates temp clip with id 800)
    liveApiCall
      .mockReturnValueOnce(undefined) // create_audio_clip
      .mockReturnValueOnce(["id", "800"]); // duplicate_clip_to_arrangement

    adjustClipPreRoll(clip, track, false, mockContext);

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

describe("createPartialTile", () => {
  // Integration test - relies on other tested helpers
  it("creates partial tile by combining helper functions", () => {
    const sourceClip = new LiveAPI("id 100");
    const track = new LiveAPI("live_set tracks 0");

    liveApiCall.mockReturnValueOnce(["id", "200"]); // Holding clip
    mockLiveApiGet({ "id 200": { end_time: 1000 } });
    liveApiCall.mockReturnValueOnce(["id", "300"]); // Temp clip
    liveApiCall.mockReturnValueOnce(["id", "400"]); // Final tile
    mockLiveApiGet({ "id 400": { start_marker: 2, loop_start: 2 } });

    const result = createPartialTile(sourceClip, track, 500, 6, 1000, true);

    expect(result).toBeInstanceOf(LiveAPI);
  });

  it("skips pre-roll adjustment when adjustPreRoll is false", () => {
    const sourceClip = new LiveAPI("id 100");

    const track = new LiveAPI("live_set tracks 0");

    // Mock createShortenedClipInHolding - clip needs to be longer than target for temp clip creation
    liveApiCall.mockReturnValueOnce(["id", "200"]);
    mockLiveApiGet({
      "id 200": {
        end_time: 1000 + 10, // Longer than target length of 8
        start_marker: 1,
        loop_start: 4,
      },
    });
    liveApiCall.mockReturnValueOnce(["id", "300"]);
    liveApiCall.mockReturnValueOnce(undefined); // delete temp clip

    // Mock moveClipFromHolding
    liveApiCall.mockReturnValueOnce(["id", "400"]);
    liveApiCall.mockReturnValueOnce(undefined); // delete holding clip

    createPartialTile(sourceClip, track, 500, 8, 1000, true, {}, false);

    // Should have 5 calls: duplicate to holding, create temp, delete temp, move to target, delete holding
    // No pre-roll adjustment calls (since adjustPreRoll is false)
    expect(liveApiCall).toHaveBeenCalledTimes(5);
  });
});

describe("tileClipToRange", () => {
  it("creates correct number of full tiles without remainder", () => {
    const sourceClip = new LiveAPI("id 100");

    const track = new LiveAPI("live_set tracks 0");

    mockLiveApiGet({
      "id 100": {
        loop_start: 0,
        loop_end: 4,
        start_marker: 0,
      },
      "id 200": {
        end_time: 104,
        start_marker: 0,
        loop_start: 0,
      },
      "id 201": {
        end_time: 108,
        start_marker: 0,
        loop_start: 0,
      },
      "id 202": {
        end_time: 112,
        start_marker: 0,
        loop_start: 0,
      },
    });

    // Mock 3 full tiles
    liveApiCall.mockReturnValueOnce(["id", "200"]);
    liveApiCall.mockReturnValueOnce(["id", "201"]);
    liveApiCall.mockReturnValueOnce(["id", "202"]);

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      12,
      1000,
      mockContext,
    );

    // Should create 3 full tiles (12 / 4 = 3)
    expect(liveApiCall).toHaveBeenCalledTimes(3);
    expect(liveApiCall).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 100",
      100,
    );
    expect(liveApiCall).toHaveBeenNthCalledWith(
      2,
      "duplicate_clip_to_arrangement",
      "id 100",
      104,
    );
    expect(liveApiCall).toHaveBeenNthCalledWith(
      3,
      "duplicate_clip_to_arrangement",
      "id 100",
      108,
    );

    expect(result).toHaveLength(3);
    expect(result).toEqual([{ id: "200" }, { id: "201" }, { id: "202" }]);
  });

  // Integration test for full + partial tiles
  it("creates appropriate combination of full and partial tiles", () => {
    const sourceClip = new LiveAPI("id 100");
    const track = new LiveAPI("live_set tracks 0");

    mockLiveApiGet({
      "id 100": { loop_start: 0, loop_end: 4, start_marker: 0 },
      "id 200": { end_time: 104, start_marker: 0, loop_start: 0 },
      "id 201": { end_time: 108, start_marker: 0, loop_start: 0 },
    });

    liveApiCall.mockReturnValue(["id", "200"]);

    // 10 beats / 4 beat clip = 2 full + 1 partial
    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      10,
      1000,
      mockContext,
    );

    expect(result.length).toBeGreaterThan(2);
  });

  it("does not create partial tile when remainder is negligible", () => {
    const sourceClip = new LiveAPI("id 100");
    const track = new LiveAPI("live_set tracks 0");

    mockLiveApiGet({
      "id 100": { loop_start: 0, loop_end: 4, start_marker: 0 },
      "id 200": { end_time: 104, start_marker: 0, loop_start: 0 },
    });

    liveApiCall.mockReturnValueOnce(["id", "200"]);

    // Total length 4.0005 should create 1 full tile, no partial
    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      4.0005,
      1000,
      mockContext,
    );

    expect(liveApiCall).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it("skips pre-roll adjustment when adjustPreRoll is false", () => {
    const sourceClip = new LiveAPI("id 100");

    const track = new LiveAPI("live_set tracks 0");

    mockLiveApiGet({
      "id 100": {
        loop_start: 4,
        loop_end: 8,
        start_marker: 2,
      },
      "id 200": {
        end_time: 104,
        start_marker: 2,
        loop_start: 4,
      },
    });

    liveApiCall.mockReturnValueOnce(["id", "200"]);

    tileClipToRange(sourceClip, track, 100, 4, 1000, mockContext, {
      adjustPreRoll: false,
    });

    // Only 1 call for duplicate, no pre-roll adjustment
    expect(liveApiCall).toHaveBeenCalledTimes(1);
  });

  it("handles zero-length range gracefully", () => {
    const sourceClip = new LiveAPI("id 100");

    const track = new LiveAPI("live_set tracks 0");

    mockLiveApiGet({
      "id 100": {
        loop_start: 0,
        loop_end: 4,
        start_marker: 0,
      },
    });

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      0,
      1000,
      mockContext,
    );

    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("handles only partial tile when total length less than clip length", () => {
    const sourceClip = new LiveAPI("id 100");
    const track = new LiveAPI("live_set tracks 0");

    mockLiveApiGet({
      "id 100": { loop_start: 0, loop_end: 8, start_marker: 0 },
    });

    liveApiCall.mockReturnValue(["id", "300"]);

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      3,
      1000,
      mockContext,
    );

    // No full tiles, only partial
    expect(result).toHaveLength(1);
  });

  it("sets start_marker correctly when using startOffset parameter", () => {
    const sourceClip = new LiveAPI("id 100");
    const track = new LiveAPI("live_set tracks 0");

    mockLiveApiGet({
      "id 100": {
        loop_start: 2,
        loop_end: 10,
        start_marker: 2,
      },
      "id 200": {
        end_time: 104,
        start_marker: 2,
        loop_start: 2,
      },
      "id 201": {
        end_time: 108,
        start_marker: 2,
        loop_start: 2,
      },
      "id 202": {
        end_time: 112,
        start_marker: 2,
        loop_start: 2,
      },
    });

    // Mock 3 full tiles
    liveApiCall.mockReturnValueOnce(["id", "200"]);
    liveApiCall.mockReturnValueOnce(["id", "201"]);
    liveApiCall.mockReturnValueOnce(["id", "202"]);

    // Tile with startOffset=3 (3 beats into the clip content)
    // Clip length = 8 beats (10 - 2)
    // Tile 1: start_marker = 2 + (3 % 8) = 5
    // Tile 2: start_marker = 2 + (11 % 8) = 5
    // Tile 3: start_marker = 2 + (19 % 8) = 5
    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      24,
      1000,
      mockContext,
      {
        startOffset: 3,
      },
    );

    // Verify start_marker is set on each tile
    const tile1 = new LiveAPI("id 200");
    const tile2 = new LiveAPI("id 201");
    const tile3 = new LiveAPI("id 202");

    expect(tile1.set).toHaveBeenCalledWith("start_marker", 5);
    expect(tile2.set).toHaveBeenCalledWith("start_marker", 5);
    expect(tile3.set).toHaveBeenCalledWith("start_marker", 5);

    expect(result).toHaveLength(3);
  });

  it("wraps start_marker correctly when offsetting through multiple loops", () => {
    const sourceClip = new LiveAPI("id 100");
    const track = new LiveAPI("live_set tracks 0");

    mockLiveApiGet({
      "id 100": {
        loop_start: 0,
        loop_end: 4,
        start_marker: 0,
      },
      "id 200": { end_time: 104, start_marker: 0, loop_start: 0 },
      "id 201": { end_time: 108, start_marker: 0, loop_start: 0 },
      "id 202": { end_time: 112, start_marker: 0, loop_start: 0 },
    });

    liveApiCall.mockReturnValueOnce(["id", "200"]);
    liveApiCall.mockReturnValueOnce(["id", "201"]);
    liveApiCall.mockReturnValueOnce(["id", "202"]);

    // Tile 1: start_marker = 0 + (0 % 4) = 0
    // Tile 2: start_marker = 0 + (4 % 4) = 0 (wraps)
    // Tile 3: start_marker = 0 + (8 % 4) = 0 (wraps)
    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      12,
      1000,
      mockContext,
      {
        startOffset: 0,
      },
    );

    const tile1 = new LiveAPI("id 200");
    const tile2 = new LiveAPI("id 201");
    const tile3 = new LiveAPI("id 202");

    expect(tile1.set).toHaveBeenCalledWith("start_marker", 0);
    expect(tile2.set).toHaveBeenCalledWith("start_marker", 0);
    expect(tile3.set).toHaveBeenCalledWith("start_marker", 0);

    expect(result).toHaveLength(3);
  });
});
