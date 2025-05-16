// device/tool-transport.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { transport } from "./tool-transport";

describe("transport", () => {
  it("should start playback from the specified position", () => {
    mockLiveApiGet({
      LiveSet: {
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({ action: "play", startTime: 16 });

    expect(liveApiSet).toHaveBeenCalledWith("start_time", 16);

    expect(liveApiCall).toHaveBeenNthCalledWith(1, "show_view", "Arranger");
    expect(liveApiCall.mock.instances[0].path).toBe("live_app view");

    expect(liveApiCall).toHaveBeenNthCalledWith(2, "start_playing");
    expect(liveApiCall.mock.instances[1].path).toBe("live_set");

    expect(result).toEqual({
      isPlaying: true,
      currentTime: 16,
      loop: false,
      loopStart: 0,
      loopLength: 4,
    });
  });

  it("should stop playback", () => {
    mockLiveApiGet({
      LiveSet: {
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({ action: "stop" });

    expect(liveApiCall).toHaveBeenNthCalledWith(1, "show_view", "Arranger");
    expect(liveApiCall.mock.instances[0].path).toBe("live_app view");

    expect(liveApiCall).toHaveBeenNthCalledWith(2, "stop_playing");
    expect(liveApiCall.mock.instances[1].path).toBe("live_set");

    expect(result).toEqual({
      isPlaying: false,
      currentTime: 0,
      loop: false,
      loopStart: 0,
      loopLength: 4,
    });
  });

  it("should configure loop settings", () => {
    const result = transport({
      action: "play",
      loop: true,
      loopStart: 8,
      loopLength: 16,
    });

    expect(liveApiSet).toHaveBeenCalledWith("loop", true);
    expect(liveApiSet).toHaveBeenCalledWith("loop_start", 8);
    expect(liveApiSet).toHaveBeenCalledWith("loop_length", 16);

    expect(result).toEqual({
      isPlaying: true,
      currentTime: 0,
      loop: true,
      loopStart: 8,
      loopLength: 16,
    });
  });

  it("should make all tracks follow arrangement", () => {
    const result = transport({
      action: "play",
      followingTracks: [-1],
    });

    expect(liveApiSet).toHaveBeenCalledWith("back_to_arranger", 0);
    expect(liveApiSet.mock.instances[0].path).toBe("live_set");
  });

  it("should make specific tracks follow arrangement", () => {
    mockLiveApiGet({
      Track: { exists: () => true },
    });

    const result = transport({
      action: "play",
      followingTracks: [0, 2],
    });

    // Check both tracks were set to follow arrangement
    expect(liveApiSet).toHaveBeenCalledWith("back_to_arranger", 0);
    expect(liveApiSet.mock.instances[0].path).toBe("live_set tracks 0");
    expect(liveApiSet).toHaveBeenCalledWith("back_to_arranger", 0);
    expect(liveApiSet.mock.instances[1].path).toBe("live_set tracks 2");
  });

  it("should update loop settings without changing playback state", async () => {
    // Mock initial state (playing)
    mockLiveApiGet({
      LiveSet: {
        is_playing: 1,
        current_song_time: 10,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = await transport({
      action: "update-loop",
      loop: true,
      loopStart: 8,
      loopLength: 16,
    });

    // Verify loop settings were changed
    expect(liveApiSet).toHaveBeenCalledWith("loop", true);
    expect(liveApiSet).toHaveBeenCalledWith("loop_start", 8);
    expect(liveApiSet).toHaveBeenCalledWith("loop_length", 16);

    // Verify is_playing was NOT changed
    expect(liveApiSet).not.toHaveBeenCalledWith("is_playing", expect.anything());
    expect(liveApiSet).not.toHaveBeenCalledWith("current_song_time", expect.anything());

    // Result should reflect the updated values
    expect(result).toEqual({
      isPlaying: true, // Unchanged from initial state
      currentTime: 10, // Unchanged from initial state
      loop: true, // Updated
      loopStart: 8, // Updated
      loopLength: 16, // Updated
    });
  });

  it("should throw an error when action is missing", () => {
    expect(() => transport({})).toThrow("transport failed: action is required");
  });
});
