import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
} from "../../test/mock-live-api.js";
import { transformClips } from "./transform-clips.js";

describe("transformClips - modifications", () => {
  it("should apply velocity modifications to MIDI clip notes", () => {
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
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (this._id === clipId && method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              id: "0",
              pitch: 60,
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              velocity_deviation: 0,
              probability: 1.0,
            },
          ],
        });
      }
    });

    transformClips({
      clipIds: clipId,
      velocityMin: -10,
      velocityMax: 10,
      seed: 12345,
    });

    // Verify apply_note_modifications was called
    expect(liveApiCall).toHaveBeenCalledWith(
      "apply_note_modifications",
      expect.stringContaining('"notes"'),
    );
  });

  it("should apply gain modifications to audio clips", () => {
    const clipId = "audio_clip_1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id audio_clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 arrangement_clips 0";
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
          return [0];
        }
        if (prop === "is_audio_clip") {
          return [1];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "gain") {
          return [0.85];
        }
        if (prop === "pitch_coarse") {
          return [0];
        }
        if (prop === "pitch_fine") {
          return [0];
        }
      }
      return [0];
    });

    transformClips({
      clipIds: clipId,
      gainMin: 0.9,
      gainMax: 1.1,
      seed: 12345,
    });

    // Verify gain was set
    expect(liveApiSet).toHaveBeenCalledWith("gain", expect.any(Number));
  });

  it("should warn when no valid clips found", () => {
    liveApiId.mockReturnValue("id 0"); // Non-existent clips

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = transformClips({ clipIds: "nonexistent", seed: 12345 });

    expect(result).toEqual({ clipIds: [], seed: 12345 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no valid clips found"),
    );
  });

  it("should apply velocityRange modifications to MIDI clip notes", () => {
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

    let capturedNotes;
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (this._id === clipId && method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              id: "0",
              pitch: 60,
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              velocity_deviation: 10,
              probability: 1.0,
            },
          ],
        });
      }
      if (this._id === clipId && method === "apply_note_modifications") {
        capturedNotes = JSON.parse(_args[0]).notes;
      }
    });

    transformClips({
      clipIds: clipId,
      velocityRange: 5,
      seed: 12345,
    });

    expect(capturedNotes[0].velocity_deviation).toBe(15);
  });

  it("should apply probability modifications to MIDI clip notes", () => {
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

    let capturedNotes;
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (this._id === clipId && method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              id: "0",
              pitch: 60,
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              velocity_deviation: 0,
              probability: 0.8,
            },
          ],
        });
      }
      if (this._id === clipId && method === "apply_note_modifications") {
        capturedNotes = JSON.parse(_args[0]).notes;
      }
    });

    transformClips({
      clipIds: clipId,
      probability: 0.1,
      seed: 12345,
    });

    expect(capturedNotes[0].probability).toBe(0.9);
  });

  it("should produce consistent results with same seed", () => {
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

    let capturedNotes1;
    let capturedNotes2;

    liveApiCall.mockImplementation(function (method, ..._args) {
      if (this._id === clipId && method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              id: "0",
              pitch: 60,
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              velocity_deviation: 0,
              probability: 1.0,
            },
          ],
        });
      }
      if (this._id === clipId && method === "apply_note_modifications") {
        const notes = JSON.parse(_args[0]).notes;
        if (!capturedNotes1) {
          capturedNotes1 = notes;
        } else {
          capturedNotes2 = notes;
        }
      }
    });

    // Run twice with same seed
    transformClips({
      clipIds: clipId,
      velocityMin: -20,
      velocityMax: 20,
      seed: 99999,
    });
    transformClips({
      clipIds: clipId,
      velocityMin: -20,
      velocityMax: 20,
      seed: 99999,
    });

    // Should produce identical results
    expect(capturedNotes1).toEqual(capturedNotes2);
  });
});
