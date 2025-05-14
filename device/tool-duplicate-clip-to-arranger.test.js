// device/tool-duplicate-clip-to-arranger.test.js
import { describe, expect, it } from "vitest";
import {
  expectedClip,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
  mockLiveApiGet,
} from "./mock-live-api";
import { duplicateClipToArranger } from "./tool-duplicate-clip-to-arranger";

describe("duplicateClipToArranger", () => {
  it("should duplicate the clip to arrangement view", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "session_clip") {
        return "live_set tracks 1 clip_slots 0 clip";
      }
      if (this._id === "arranger_clip") {
        return "live_set tracks 1 arrangement_clip 0";
      }
      return "";
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "arranger_clip") {
        return "Clip";
      }
    });
    liveApiCall.mockImplementation(function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", "arranger_clip"];
      }
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [],
        });
      }
      return null;
    });
    mockLiveApiGet({
      arranger_clip: {
        name: "Arranger Clip",
        is_arrangement_clip: 1,
        start_time: 8,
      },
    });

    const result = duplicateClipToArranger({ clipId: "session_clip", arrangerStartTime: 8 });

    expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_to_arrangement", "id session_clip", 8);
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");

    expect(result).toEqual(
      expectedClip({
        id: "arranger_clip",
        view: "Arranger",
        name: "Arranger Clip",
        trackIndex: 1,
        clipSlotIndex: undefined,
        arrangerStartTime: 8,
      })
    );
  });

  it("should set the clip name when provided", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "session_clip") return "live_set tracks 1 clip_slots 0 clip";
      if (this._id === "arranger_clip") return "live_set tracks 1 arrangement_clip 0";
      return this.__path;
    });
    liveApiCall.mockImplementation(function (method) {
      if (method === "duplicate_clip_to_arrangement") return ["id", "arranger_clip"];
    });

    mockLiveApiGet({ arranger_clip: { name: "Custom Name", is_arrangement_clip: 1 } });

    duplicateClipToArranger({ clipId: "session_clip", arrangerStartTime: 8, name: "Custom Name" });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Name");
    expect(liveApiSet.mock.instances[0].path).toBe("live_set tracks 1 arrangement_clip 0");
  });

  it("should throw an error when clipId is not provided", () => {
    expect(() => duplicateClipToArranger({ arrangerStartTime: 8 })).toThrow(
      "duplicate-clip-to-arranger failed: clipId is required"
    );
  });

  it("should throw an error when arrangerStartTime is not provided", () => {
    expect(() => duplicateClipToArranger({ clipId: "clip_1" })).toThrow(
      "duplicate-clip-to-arranger failed: arrangerStartTime is required"
    );
  });

  it("should throw an error when clip doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => duplicateClipToArranger({ clipId: "nonexistent_clip", arrangerStartTime: 8 })).toThrow(
      'duplicate-clip-to-arranger failed: no clip exists for clipId "nonexistent_clip"'
    );
  });

  it("should throw an error when track index can't be determined", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "invalid_clip") {
        return "some_invalid_path";
      }
      return "";
    });

    mockLiveApiGet({
      invalid_clip: { exists: () => true },
    });

    expect(() => duplicateClipToArranger({ clipId: "invalid_clip", arrangerStartTime: 8 })).toThrow(
      'duplicate-clip-to-arranger failed: no track index for clipId "invalid_clip"'
    );
  });

  it("should throw an error when duplication fails", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "session_clip") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      return "";
    });

    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", null];
      }
      return null;
    });

    mockLiveApiGet({
      session_clip: { exists: () => true },
    });

    expect(() => duplicateClipToArranger({ clipId: "session_clip", arrangerStartTime: 8 })).toThrow(
      "duplicate-clip-to-arranger failed: clip failed to duplicate"
    );
  });
});
