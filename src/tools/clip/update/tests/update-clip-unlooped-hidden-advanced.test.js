import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../../../../test/mock-live-api.js";
import { mockContext } from "../helpers/update-clip-test-helpers.js";
import { updateClip } from "../update-clip.js";

describe("arrangementLength (unlooped clips with hidden content)", () => {
  it("should NOT reveal when start_marker offset means no hidden content (track 3 scenario)", () => {
    const trackIndex = 0;
    const clipId = "830";
    const emptyClipId = "831";

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || this._id === emptyClipId) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }
      if (this._path === "live_set") {
        return "live_set";
      }
      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }
      return this._path;
    });

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 0, // Unlooped clip
        start_time: 0.0,
        end_time: 3.0, // 3 beats visible in arrangement
        start_marker: 1.0, // Offset by 1 beat
        end_marker: 4.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Track 3 Test Clip",
        trackIndex,
      },
      [emptyClipId]: {
        start_time: 3.0,
        end_time: 14.0,
      },
      LiveSet: {
        tracks: ["id", trackIndex],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      [`live_set tracks ${trackIndex}`]: {
        arrangement_clips: ["id", clipId],
      },
    });

    // Mock get_notes_extended - notes from 1-4 beats, all visible
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              pitch: 60,
              start_time: 1.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 62,
              start_time: 2.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 64,
              start_time: 3.0,
              duration: 1.0, // Ends at beat 4, all visible
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
          ],
        });
      }
      if (method === "create_midi_clip") {
        return `id ${emptyClipId}`;
      }
      return undefined;
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = updateClip(
      {
        ids: clipId,
        arrangementLength: "3:2", // 14 beats (3.5 bars)
      },
      mockContext,
    );

    consoleErrorSpy.mockRestore();

    // Should NOT call duplicate_clip_to_arrangement (no hidden content to reveal)
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );

    // Should only return original + empty clip (no revealed clip)
    expect(result).toEqual([{ id: clipId }, { id: emptyClipId }]);
  });

  it("should calculate correct markers with start_marker offset (track 4 scenario)", () => {
    const trackIndex = 0;
    const clipId = "840";
    const revealedClipId = "841";
    const emptyClipId = "842";

    liveApiPath.mockImplementation(function () {
      if (
        this._id === clipId ||
        this._id === revealedClipId ||
        this._id === emptyClipId
      ) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }
      if (this._path === "live_set") {
        return "live_set";
      }
      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }
      return this._path;
    });

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 0, // Unlooped clip
        start_time: 0.0,
        end_time: 2.0, // 2 beats visible in arrangement
        start_marker: 1.0, // Offset by 1 beat
        end_marker: 3.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Track 4 Test Clip",
        trackIndex,
      },
      [revealedClipId]: {
        start_time: 2.0,
        end_time: 3.0,
        start_marker: 1.0,
        end_marker: 3.0,
      },
      [emptyClipId]: {
        start_time: 3.0,
        end_time: 14.0,
      },
      LiveSet: {
        tracks: ["id", trackIndex],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      [`live_set tracks ${trackIndex}`]: {
        arrangement_clips: ["id", clipId],
      },
    });

    // Mock get_notes_extended - notes from 1-4 beats
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              pitch: 60,
              start_time: 1.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 62,
              start_time: 2.0,
              duration: 1.0, // Visible
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 64,
              start_time: 3.0,
              duration: 1.0, // Hidden (ends at beat 4)
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
          ],
        });
      }
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${revealedClipId}`;
      }
      if (method === "create_midi_clip") {
        return `id ${emptyClipId}`;
      }
      return undefined;
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = updateClip(
      {
        ids: clipId,
        arrangementLength: "3:2", // 14 beats (3.5 bars)
      },
      mockContext,
    );

    consoleErrorSpy.mockRestore();

    // Critical: verify markers account for start_marker offset
    // visibleContentEnd = 1.0 (start_marker) + 2.0 (currentArrangementLength) = 3.0
    // newStartMarker should be 3.0, newEndMarker should be 4.0
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      4.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "start_marker",
      3.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      0,
    );

    // Should return original + revealed + empty clips
    expect(result).toEqual([
      { id: clipId },
      { id: revealedClipId },
      { id: emptyClipId },
    ]);
  });
});
