// device/tool-delete-clip.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiType } from "./mock-live-api";
import { deleteClip } from "./tool-delete-clip";

describe("deleteClip", () => {
  it("should delete a clip when it exists", () => {
    const id = "clip_0_0";
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0 clip_slots 0 clip":
          return id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case id:
          return "live_set tracks 0 clip_slots 0 clip";
      }
    });

    const result = deleteClip({ id });

    expect(result).toEqual({ id, deleted: true });
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_clip", `id ${id}`);
    expect(liveApiCall.mock.instances[0].path).toBe("live_set tracks 0");
  });

  it("should throw an error when id arg is missing", () => {
    const expectedError = "delete-clip failed: id is required";
    expect(() => deleteClip()).toThrow(expectedError);
    expect(() => deleteClip({})).toThrow(expectedError);
    expect(() => deleteClip({ ID: "clip_1" })).toThrow(expectedError);
  });

  it("should throw an error when no clip exists", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => deleteClip({ id: "clip_1" })).toThrow('delete-clip failed: id "clip_1" does not exist');
  });

  it("should throw an error when the id exists but is not a clip id", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "track_1") return "Track";
    });
    expect(() => deleteClip({ id: "track_1" })).toThrow('delete-clip failed: id "track_1" was not a clip (type=Track)');
  });

  it("should throw an error when the clip's path doesn't contain a track index", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "clip_1") return "Clip";
    });
    expect(() => deleteClip({ id: "clip_1" })).toThrow(
      'delete-clip failed: no track index for id "clip_1" (path="id clip_1")'
    );
  });
});
