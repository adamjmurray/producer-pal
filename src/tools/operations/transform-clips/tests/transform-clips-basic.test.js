import { describe, expect, it } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.js";

// [transform-clips-basic] Setup mocks for a simple MIDI clip
function setupSimpleMidiClipMocks(
  clipId,
  clipPath = "live_set tracks 0 clip_slots 0 clip",
) {
  liveApiId.mockImplementation(function () {
    return this._path === `id ${clipId}` ? clipId : this._id;
  });
  liveApiPath.mockImplementation(function () {
    return this._id === clipId ? clipPath : this._path;
  });
  liveApiType.mockImplementation(function () {
    return this._id === clipId ? "Clip" : undefined;
  });
  liveApiGet.mockImplementation(function (prop) {
    if (this._id !== clipId) return [0];
    const props = {
      is_midi_clip: [1],
      is_audio_clip: [0],
      is_arrangement_clip: [0],
      length: [4.0],
    };

    return props[prop] ?? [0];
  });
}

describe("transformClips - basic", () => {
  it("should throw error when clipIds and arrangementTrackIndex are missing", () => {
    expect(() => transformClips()).toThrow(
      "transformClips failed: clipIds or arrangementTrackIndex is required",
    );
    expect(() => transformClips({})).toThrow(
      "transformClips failed: clipIds or arrangementTrackIndex is required",
    );
  });

  it("should return clipIds and seed when provided valid clips", () => {
    const clipId = "clip_1";

    setupSimpleMidiClipMocks(clipId);

    const result = transformClips({ clipIds: clipId, seed: 12345 });

    expect(result).toStrictEqual({ clipIds: [clipId], seed: 12345 });
  });

  it("should generate seed from Date.now() when not provided", () => {
    const clipId = "clip_1";

    setupSimpleMidiClipMocks(clipId);

    const result = transformClips({ clipIds: clipId });

    expect(result).toHaveProperty("clipIds");
    expect(result).toHaveProperty("seed");
    expect(typeof result.seed).toBe("number");
    expect(result.seed).toBeGreaterThan(0);
  });

  it("should handle comma-separated clip IDs", () => {
    const clipIds = "clip_1,clip_2,clip_3";

    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return "clip_1";
      }

      if (this._path === "id clip_2") {
        return "clip_2";
      }

      if (this._path === "id clip_3") {
        return "clip_3";
      }

      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip_1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }

      if (this._id === "clip_2") {
        return "live_set tracks 0 clip_slots 1 clip";
      }

      if (this._id === "clip_3") {
        return "live_set tracks 0 clip_slots 2 clip";
      }

      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (["clip_1", "clip_2", "clip_3"].includes(this._id)) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (["clip_1", "clip_2", "clip_3"].includes(this._id)) {
        if (prop === "is_midi_clip") {
          return [1];
        }

        if (prop === "is_audio_clip") {
          return [0];
        }

        if (prop === "is_arrangement_clip") {
          return [0];
        }

        if (prop === "length") {
          return [4.0];
        }
      }

      return [0];
    });

    const result = transformClips({ clipIds, seed: 12345 });

    expect(result.clipIds).toStrictEqual(["clip_1", "clip_2", "clip_3"]);
  });
});
