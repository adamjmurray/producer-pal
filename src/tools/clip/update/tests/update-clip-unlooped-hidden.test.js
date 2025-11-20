import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../../../../../test/mock-live-api.js";
import { mockContext } from "../helpers/update-clip-test-helpers.js";
import { updateClip } from "../update-clip.js";

describe("arrangementLength (unlooped clips with hidden content)", () => {
  it("should reveal 1 beat of hidden content (track 2 scenario)", () => {
    const trackIndex = 0;
    const clipId = "800";
    const revealedClipId = "801";
    const emptyClipId = "802";

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
        end_time: 3.0, // 3 beats visible in arrangement
        start_marker: 0.0,
        end_marker: 3.0,
        loop_start: 0.0,
        loop_end: 4.0, // Not used for unlooped clips
        name: "Track 2 Test Clip",
        trackIndex,
      },
      [revealedClipId]: {
        start_time: 3.0,
        end_time: 4.0,
        start_marker: 0.0, // Will be set to 3.0 by the code
        end_marker: 3.0, // Will be set to 4.0 by the code
      },
      [emptyClipId]: {
        start_time: 4.0,
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

    // Mock get_notes_extended to return notes extending to beat 4
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "get_notes_extended") {
        // Return notes from 0-4 beats (1 beat hidden)
        return JSON.stringify({
          notes: [
            {
              pitch: 60,
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 62,
              start_time: 1.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 64,
              start_time: 2.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 65,
              start_time: 3.0,
              duration: 1.0, // Ends at beat 4 (hidden)
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
          ],
        });
      }
      if (method === "duplicate_clip_to_arrangement") {
        // Return revealed clip when duplicating to position 3.0
        if (args[1] === 3.0) {
          return `id ${revealedClipId}`;
        }
      }
      if (method === "create_midi_clip") {
        // Return empty clip
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

    // Verify revealed clip markers are set correctly
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "start_marker",
      3.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      4.0,
    );

    // Should return original + revealed + empty clips
    expect(result).toEqual([
      { id: clipId },
      { id: revealedClipId },
      { id: emptyClipId },
    ]);
  });

  it("should reveal 2 beats of hidden content (track 4 scenario)", () => {
    const trackIndex = 0;
    const clipId = "810";
    const revealedClipId = "811";
    const emptyClipId = "812";

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
        start_marker: 0.0,
        end_marker: 2.0,
        loop_start: 0.0,
        loop_end: 4.0, // Not used for unlooped clips
        name: "Track 4 Test Clip",
        trackIndex,
      },
      [revealedClipId]: {
        start_time: 2.0,
        end_time: 4.0,
        start_marker: 0.0, // Will be set to 2.0 by the code
        end_marker: 2.0, // Will be set to 4.0 by the code
      },
      [emptyClipId]: {
        start_time: 4.0,
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

    // Mock get_notes_extended to return notes extending to beat 4
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "get_notes_extended") {
        // Return notes from 0-4 beats (2 beats hidden)
        return JSON.stringify({
          notes: [
            {
              pitch: 60,
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 62,
              start_time: 1.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 64,
              start_time: 2.0,
              duration: 1.0, // Hidden
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 65,
              start_time: 3.0,
              duration: 1.0, // Hidden, ends at beat 4
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
          ],
        });
      }
      if (method === "duplicate_clip_to_arrangement") {
        // Return revealed clip when duplicating to position 2.0
        if (args[1] === 2.0) {
          return `id ${revealedClipId}`;
        }
      }
      if (method === "create_midi_clip") {
        // Return empty clip
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

    // Verify revealed clip markers are set correctly
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "start_marker",
      2.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      4.0,
    );

    // Should return original + revealed + empty clips
    expect(result).toEqual([
      { id: clipId },
      { id: revealedClipId },
      { id: emptyClipId },
    ]);
  });

  it("should verify start_marker offset for track 6 scenario", () => {
    const trackIndex = 0;
    const clipId = "820";
    const revealedClipId = "821";
    const emptyClipId = "822";

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
        end_time: 3.0, // 3 beats visible
        start_marker: 0.0,
        end_marker: 3.0,
        loop_start: 0.0,
        loop_end: 4.0, // Not used for unlooped clips
        name: "Track 6 Test Clip",
        trackIndex,
      },
      [revealedClipId]: {
        start_time: 3.0,
        end_time: 4.0,
        start_marker: 0.0, // Will be set to 3.0 by the code
        end_marker: 3.0, // Will be set to 4.0 by the code
      },
      [emptyClipId]: {
        start_time: 4.0,
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

    // Mock get_notes_extended to return notes at different pitches to verify offset
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "get_notes_extended") {
        // Return notes from 0-4 beats with distinct pitches to verify offset
        return JSON.stringify({
          notes: [
            {
              pitch: 60, // C
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 64, // E
              start_time: 1.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 67, // G
              start_time: 2.0,
              duration: 1.0,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
            {
              pitch: 72, // C (octave) - THIS SHOULD BE REVEALED
              start_time: 3.0,
              duration: 1.0, // Ends at beat 4 (hidden)
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            },
          ],
        });
      }
      if (method === "duplicate_clip_to_arrangement") {
        // Return revealed clip when duplicating to position 3.0
        if (args[1] === 3.0) {
          return `id ${revealedClipId}`;
        }
      }
      if (method === "create_midi_clip") {
        // Return empty clip
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

    // Critical assertion: verify start_marker is set to 3.0
    // This ensures the revealed clip shows beats 3-4 (pitch 72), not beats 0-1 (pitch 60/64)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "start_marker",
      3.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      4.0,
    );

    // Should return original + revealed + empty clips
    expect(result).toEqual([
      { id: clipId },
      { id: revealedClipId },
      { id: emptyClipId },
    ]);
  });

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
