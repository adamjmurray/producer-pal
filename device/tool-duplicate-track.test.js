// device/tool-duplicate-track.test.js
import { describe, expect, it } from "vitest";
import { expectedTrack, liveApiCall, liveApiId, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { duplicateTrack } from "./tool-duplicate-track";

describe("duplicateTrack", () => {
  it("should duplicate the track at the specified index", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 1") return "duplicated_track";
    });
    mockLiveApiGet({
      "live_set tracks 1": {
        name: "Duplicated Track",
      },
    });

    const result = duplicateTrack({ trackIndex: 0 });

    expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 0);
    expect(result).toEqual(
      expectedTrack({
        trackIndex: 1,
        id: "duplicated_track",
        name: "Duplicated Track",
      })
    );
  });

  it("should set the track name when provided", () => {
    duplicateTrack({ trackIndex: 0, name: "Custom Track Name" });

    expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 0);

    expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Track Name");
    expect(liveApiSet.mock.instances[0].path).toBe("live_set tracks 1");
  });

  it("should throw an error when trackIndex is not provided", () => {
    expect(() => duplicateTrack({})).toThrow("duplicate-track failed: trackIndex is required");
    expect(() => duplicateTrack()).toThrow("duplicate-track failed: trackIndex is required");
  });
});
