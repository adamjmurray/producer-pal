// device/tool-duplicate-clip-slot.test.js
import { describe, expect, it } from "vitest";
import { expectedClip, liveApiCall, liveApiId, mockLiveApiGet } from "./mock-live-api";
import { duplicateClipSlot } from "./tool-duplicate-clip-slot";

describe("duplicateClipSlot", () => {
  it("should duplicate the clip slot at the specified position", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 1 clip_slots 3 clip") return "duplicated_clip";
    });
    mockLiveApiGet({
      "live_set tracks 1 clip_slots 3 clip": {
        name: "Duplicated Clip",
      },
    });
    const result = duplicateClipSlot({ trackIndex: 1, clipSlotIndex: 2 });

    expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_slot", 2);
    expect(result).toEqual(
      expectedClip({
        id: "duplicated_clip",
        name: "Duplicated Clip",
        trackIndex: 1,
        clipSlotIndex: 3,
      })
    );
  });

  it("should throw an error when trackIndex is not provided", () => {
    expect(() => duplicateClipSlot({ clipSlotIndex: 0 })).toThrow("duplicate-clip-slot failed: trackIndex is required");
  });

  it("should throw an error when clipSlotIndex is not provided", () => {
    expect(() => duplicateClipSlot({ trackIndex: 0 })).toThrow("duplicate-clip-slot failed: clipSlotIndex is required");
  });

  it("should throw an error when track doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => duplicateClipSlot({ trackIndex: 99, clipSlotIndex: 0 })).toThrow(
      "duplicate-clip-slot failed: track with index 99 does not exist"
    );
  });
});
