import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "#src/test/mocks/mock-live-api.js";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.js";
import { setupClipMocks } from "./transform-clips-test-helpers.js";

/**
 * Setup liveApiCall mock for capturing modified notes
 * @param {string} clipId - Clip ID to mock
 * @param {object} noteOverrides - Properties to override on the test note
 * @returns {function} - Function that returns captured notes array
 */
function setupNoteCaptureMock(clipId, noteOverrides = {}) {
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
            probability: 1.0,
            ...noteOverrides,
          },
        ],
      });
    }

    if (this._id === clipId && method === "apply_note_modifications") {
      capturedNotes = JSON.parse(_args[0]).notes;
    }
  });

  return () => capturedNotes;
}

describe("transformClips - modifications", () => {
  it("should apply velocity modifications to MIDI clip notes", () => {
    const clipId = "clip_1";

    setupClipMocks(clipId);
    setupNoteCaptureMock(clipId);

    transformClips({
      clipIds: clipId,
      velocityMin: -10,
      velocityMax: 10,
      seed: 12345,
    });

    expect(liveApiCall).toHaveBeenCalledWith(
      "apply_note_modifications",
      expect.stringContaining('"notes"'),
    );
  });

  it("should apply gain modifications to audio clips", () => {
    const clipId = "audio_clip_1";

    setupClipMocks(clipId, {
      path: "live_set tracks 0 arrangement_clips 0",
      isMidi: false,
      isArrangement: true,
    });
    // Add audio-specific props
    const origGet = liveApiGet.getMockImplementation();

    liveApiGet.mockImplementation(function (prop) {
      if (
        this._id === clipId &&
        ["gain", "pitch_coarse", "pitch_fine"].includes(prop)
      ) {
        return prop === "gain" ? [0.85] : [0];
      }

      return origGet.call(this, prop);
    });

    transformClips({
      clipIds: clipId,
      gainDbMin: -2,
      gainDbMax: 2,
      seed: 12345,
    });

    expect(liveApiSet).toHaveBeenCalledWith("gain", expect.any(Number));
  });

  it("should warn when no valid clips found", () => {
    liveApiId.mockReturnValue("id 0"); // Non-existent clips

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = transformClips({ clipIds: "nonexistent", seed: 12345 });

    expect(result).toStrictEqual({ clipIds: [], seed: 12345 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no valid clips found"),
    );
  });

  it("should apply velocityRange modifications to MIDI clip notes", () => {
    const clipId = "clip_1";

    setupClipMocks(clipId);
    const getCapturedNotes = setupNoteCaptureMock(clipId, {
      velocity_deviation: 10,
    });

    transformClips({
      clipIds: clipId,
      velocityRange: 5,
      seed: 12345,
    });

    expect(getCapturedNotes()[0].velocity_deviation).toBe(15);
  });

  it("should apply probability modifications to MIDI clip notes", () => {
    const clipId = "clip_1";

    setupClipMocks(clipId);
    const getCapturedNotes = setupNoteCaptureMock(clipId, { probability: 0.8 });

    transformClips({
      clipIds: clipId,
      probability: 0.1,
      seed: 12345,
    });

    expect(getCapturedNotes()[0].probability).toBe(0.9);
  });

  it("should produce consistent results with same seed", () => {
    const clipId = "clip_1";

    setupClipMocks(clipId);

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
    expect(capturedNotes1).toStrictEqual(capturedNotes2);
  });

  it("should apply transposeValues to MIDI clip notes", () => {
    const clipId = "clip_1";

    setupClipMocks(clipId);
    const getCapturedNotes = setupNoteCaptureMock(clipId);

    transformClips({
      clipIds: clipId,
      transposeValues: "-12, 0, 12",
      seed: 12345,
    });

    // Should pick one of the discrete values
    const transposedPitch = getCapturedNotes()[0].pitch;

    expect([48, 60, 72]).toContain(transposedPitch);
  });

  it("should apply transposeValues to audio clips", () => {
    const clipId = "audio_clip_1";

    setupClipMocks(clipId, {
      path: "live_set tracks 0 arrangement_clips 0",
      isMidi: false,
      isArrangement: true,
    });
    // Add audio pitch props
    const origGet = liveApiGet.getMockImplementation();

    liveApiGet.mockImplementation(function (prop) {
      if (
        this._id === clipId &&
        ["pitch_coarse", "pitch_fine"].includes(prop)
      ) {
        return [0];
      }

      return origGet.call(this, prop);
    });

    transformClips({
      clipIds: clipId,
      transposeValues: "-12, 0, 12",
      seed: 12345,
    });

    // Verify pitch was set (either pitch_coarse or pitch_fine)
    expect(liveApiSet).toHaveBeenCalledWith("pitch_coarse", expect.any(Number));
  });

  it("should warn when both transposeValues and transposeMin/transposeMax are provided", () => {
    const clipId = "clip_1";

    setupClipMocks(clipId);
    setupNoteCaptureMock(clipId);

    const consoleErrorSpy = vi.spyOn(console, "error");

    transformClips({
      clipIds: clipId,
      transposeValues: "-12, 0, 12",
      transposeMin: -12,
      transposeMax: 12,
      seed: 12345,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("transposeValues ignores transposeMin"),
    );
  });
});
