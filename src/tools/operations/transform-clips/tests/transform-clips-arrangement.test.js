import { describe, expect, it } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mock-live-api.js";
import { transformClips } from "../transform-clips.js";

describe("transformClips - arrangement", () => {
  it("should accept arrangementTrackIndex with arrangementStart/Length instead of clipIds", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return "clip_1";
      }

      if (this._path === "id clip_2") {
        return "clip_2";
      }

      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip_1") {
        return "live_set tracks 0 arrangement_clips 0";
      }

      if (this._id === "clip_2") {
        return "live_set tracks 0 arrangement_clips 1";
      }

      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._path === "live_set tracks 0") {
        return "Track";
      }

      if (["clip_1", "clip_2"].includes(this._id)) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }

        if (prop === "signature_denominator") {
          return [4];
        }
      }

      if (this._path === "live_set tracks 0" && prop === "arrangement_clips") {
        return ["id", "clip_1", "id", "clip_2"];
      }

      if (this._id === "clip_1") {
        if (prop === "start_time") {
          return [0.0]; // At bar 1
        }

        if (prop === "is_midi_clip") {
          return [1];
        }

        if (prop === "is_audio_clip") {
          return [0];
        }

        if (prop === "is_arrangement_clip") {
          return [1];
        }

        if (prop === "length") {
          return [4.0];
        }
      }

      if (this._id === "clip_2") {
        if (prop === "start_time") {
          return [8.0]; // At bar 3
        }

        if (prop === "is_midi_clip") {
          return [1];
        }

        if (prop === "is_audio_clip") {
          return [0];
        }

        if (prop === "is_arrangement_clip") {
          return [1];
        }

        if (prop === "length") {
          return [4.0];
        }
      }

      return [0];
    });

    const result = transformClips({
      arrangementTrackIndex: "0",
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    // 4 bars = 16 beats, so range is [0, 16)
    // clip_1 at 0.0 and clip_2 at 8.0 are both in range
    expect(result.clipIds).toEqual(["clip_1", "clip_2"]);
  });

  it("should prioritize clipIds over arrangementTrackIndex when both provided", () => {
    const clipId = "clip_1";

    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }

      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 clip_slots 0 clip";
      }

      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._id === clipId) {
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

    const result = transformClips({
      clipIds: clipId,
      arrangementTrackIndex: "0", // Should be ignored
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    expect(result.clipIds).toEqual([clipId]);
  });

  it("should filter clips by start_time in arrangement range", () => {
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
        return "live_set tracks 0 arrangement_clips 0";
      }

      if (this._id === "clip_2") {
        return "live_set tracks 0 arrangement_clips 1";
      }

      if (this._id === "clip_3") {
        return "live_set tracks 0 arrangement_clips 2";
      }

      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._path === "live_set tracks 0") {
        return "Track";
      }

      if (["clip_1", "clip_2", "clip_3"].includes(this._id)) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }

        if (prop === "signature_denominator") {
          return [4];
        }
      }

      if (this._path === "live_set tracks 0" && prop === "arrangement_clips") {
        return ["id", "clip_1", "id", "clip_2", "id", "clip_3"];
      }

      if (this._id === "clip_1") {
        if (prop === "start_time") {
          return [0.0]; // Bar 1
        }

        if (prop === "is_midi_clip") {
          return [1];
        }

        if (prop === "is_audio_clip") {
          return [0];
        }

        if (prop === "is_arrangement_clip") {
          return [1];
        }

        if (prop === "length") {
          return [4.0];
        }
      }

      if (this._id === "clip_2") {
        if (prop === "start_time") {
          return [4.0]; // Bar 2
        }

        if (prop === "is_midi_clip") {
          return [1];
        }

        if (prop === "is_audio_clip") {
          return [0];
        }

        if (prop === "is_arrangement_clip") {
          return [1];
        }

        if (prop === "length") {
          return [4.0];
        }
      }

      if (this._id === "clip_3") {
        if (prop === "start_time") {
          return [16.0]; // Bar 5 (outside range)
        }

        if (prop === "is_midi_clip") {
          return [1];
        }

        if (prop === "is_audio_clip") {
          return [0];
        }

        if (prop === "is_arrangement_clip") {
          return [1];
        }

        if (prop === "length") {
          return [4.0];
        }
      }

      return [0];
    });

    const result = transformClips({
      arrangementTrackIndex: "0",
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    // Should include clips starting at 0.0 and 4.0, but not 16.0
    expect(result.clipIds).toEqual(["clip_1", "clip_2"]);
  });

  it("should warn when no clips found in arrangement range", () => {
    liveApiType.mockImplementation(function () {
      if (this._path === "live_set tracks 0") {
        return "Track";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }

        if (prop === "signature_denominator") {
          return [4];
        }
      }

      if (this._path === "live_set tracks 0" && prop === "arrangement_clips") {
        return []; // No clips
      }

      return [0];
    });

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = transformClips({
      arrangementTrackIndex: "0",
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    expect(result).toEqual({ clipIds: [], seed: 12345 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no clips found in arrangement range"),
    );
  });
});
