// device/tool-play-session-clip.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, mockLiveApiGet } from "./mock-live-api";
import { playSessionClip } from "./tool-play-session-clip";

describe("playSessionClip", () => {
  it("should trigger a clip to play when it exists", () => {
    mockLiveApiGet({ ClipSlot: { has_clip: 1 } });

    const result = playSessionClip({ trackIndex: 0, clipSlotIndex: 1 });

    expect(liveApiCall).toHaveBeenNthCalledWith(1, "show_view", "Session");
    expect(liveApiCall.mock.instances[0].path).toBe("live_app view");

    expect(liveApiCall).toHaveBeenNthCalledWith(2, "fire");
    expect(liveApiCall.mock.instances[1].path).toBe("live_set tracks 0 clip_slots 1");

    expect(result).toEqual({ message: "Clip at trackIndex=0, clipSlotIndex=1 has been triggered" });
  });

  it("should throw an error when the clip slot doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => playSessionClip({ trackIndex: 99, clipSlotIndex: 0 })).toThrow(
      "play-session-clip failed: clip slot at trackIndex=99, clipSlotIndex=0 does not exist"
    );
  });

  it("should throw an error when the clip slot is empty", () => {
    mockLiveApiGet({ ClipSlot: { has_clip: 0 } });
    expect(() => playSessionClip({ trackIndex: 0, clipSlotIndex: 0 })).toThrow(
      "play-session-clip failed: no clip at trackIndex=0, clipSlotIndex=0"
    );
  });

  it("should throw an error when trackIndex is missing", () => {
    expect(() => playSessionClip({ clipSlotIndex: 0 })).toThrow("play-session-clip failed: trackIndex is required");
  });

  it("should throw an error when clipSlotIndex is missing", () => {
    expect(() => playSessionClip({ trackIndex: 0 })).toThrow("play-session-clip failed: clipSlotIndex is required");
  });
});
