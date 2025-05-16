// device/tool-stop-session-clip.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId } from "./mock-live-api";
import { stopSessionClip } from "./tool-stop-session-clip";

describe("stopSessionClip", () => {
  it("should stop all clips in all tracks when trackIndex is '*'", async () => {
    const result = await stopSessionClip({ trackIndex: -1 });

    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
    expect(liveApiCall.mock.instances[0].path).toBe("live_set");

    expect(result).toEqual({ message: "All clips in all tracks stopped" });
  });

  it("should stop all clips in a specific track", () => {
    const result = stopSessionClip({ trackIndex: 1 });

    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
    expect(liveApiCall.mock.instances[0].path).toBe("live_set tracks 1");

    expect(result).toEqual({ message: "Clips on trackIndex=1 stopped" });
  });

  it("should throw an error when the track doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => stopSessionClip({ trackIndex: 99 })).toThrow(
      "stop-session-clip failed: track at trackIndex=99 does not exist"
    );
  });

  it("should throw an error when trackIndex is missing", () => {
    expect(() => stopSessionClip({})).toThrow("stop-session-clip failed: trackIndex is required");
  });
});
