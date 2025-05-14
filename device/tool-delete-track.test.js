// device/tool-delete-track.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiType } from "./mock-live-api";
import { deleteTrack } from "./tool-delete-track";

describe("deleteTrack", () => {
  it("should delete a track when it exists", () => {
    const id = "track_2";
    const trackIndex = 1;
    const path = `live_set tracks ${trackIndex}`;
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case path:
          return id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case id:
          return path;
      }
    });

    const result = deleteTrack({ id });

    expect(result).toEqual({ id, deleted: true });
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_track", trackIndex);
    expect(liveApiCall.mock.instances[0].path).toBe("live_set");
  });

  it("should throw an error when id arg is missing", () => {
    const expectedError = "delete-track failed: id is required";
    expect(() => deleteTrack()).toThrow(expectedError);
    expect(() => deleteTrack({})).toThrow(expectedError);
    expect(() => deleteTrack({ ID: "track_1" })).toThrow(expectedError);
  });

  it("should throw an error when no track exists", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => deleteTrack({ id: "track_1" })).toThrow('delete-track failed: id "track_1" does not exist');
  });

  it("should throw an error when the id exists but is not a track id", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "clip_1") return "Clip";
    });
    expect(() => deleteTrack({ id: "clip_1" })).toThrow('delete-track failed: id "clip_1" was not a track (type=Clip)');
  });

  it("should throw an error when the track's path doesn't contain a track index", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "track_1") return "Track";
    });
    expect(() => deleteTrack({ id: "track_1" })).toThrow(
      'delete-track failed: no track index for id "track_1" (path="id track_1")'
    );
  });
});
