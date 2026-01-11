import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveAPI,
  liveApiCall,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { createPartialTile, tileClipToRange } from "./arrangement-tiling.js";

// Mock context for tests
const mockContext = {
  silenceWavPath: "/tmp/test-silence.wav",
};

beforeEach(() => {
  vi.clearAllMocks();
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
    liveApiCall.mockReturnValueOnce(); // delete temp clip

    // Mock moveClipFromHolding
    liveApiCall.mockReturnValueOnce(["id", "400"]);
    liveApiCall.mockReturnValueOnce(); // delete holding clip

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
    expect(result).toStrictEqual([{ id: "200" }, { id: "201" }, { id: "202" }]);
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
    expect(result).toStrictEqual([]);
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
