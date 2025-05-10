// device/delete-clip.test.js
import { describe, it, expect } from "vitest";
import { mockLiveApiGet, liveApiCall } from "./mock-live-api";
import { deleteClip } from "./delete-clip";

describe("deleteClip", () => {
  it("should delete a clip when it exists", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 1 },
    });

    const result = deleteClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Deleted clip");
    expect(liveApiCall).toHaveBeenCalledWith("delete_clip");
  });

  it("should return an error when no clip exists", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
    });

    const result = deleteClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No clip exists");
    expect(liveApiCall).not.toHaveBeenCalled();
  });
});
