import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiSet, mockLiveApiGet } from "#src/test/mock-live-api.js";
import { setupMocks } from "#src/tools/clip/update/helpers/update-clip-test-helpers.js";
import { updateClip } from "#src/tools/clip/update/update-clip.js";

describe("updateClip - Clip boundaries (shortening)", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("should set length without explicit start using current loop_start", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 1,
        loop_start: 4.0, // bar 2 beat 1 in 4/4
      },
    });

    const result = updateClip({
      ids: "123",
      length: "2:0", // 8 beats = 2 bars
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "loop_end",
      12, // loop_start (4) + length (8) = 12
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should set firstStart for looping clips", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      start: "1|1",
      length: "4:0",
      firstStart: "3|1",
      looping: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "start_marker",
      8, // 3|1 in 4/4 = 8 Ableton beats
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "loop_start",
      0, // 1|1 in 4/4 = 0 Ableton beats
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "loop_end",
      16, // start (0) + length (16) = 16
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn when firstStart provided for non-looping clips", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 0,
      },
    });

    const result = updateClip({
      ids: "123",
      start: "1|1",
      length: "4:0",
      firstStart: "2|1",
      looping: false,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Warning: firstStart parameter ignored for non-looping clips",
    );

    consoleErrorSpy.mockRestore();
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should set end_marker for non-looping clips", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 0,
      },
    });

    const result = updateClip({
      ids: "123",
      start: "1|1",
      length: "4:0",
      looping: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "start_marker",
      0, // 1|1 in 4/4 = 0 Ableton beats
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "end_marker",
      16, // start (0) + length (16) = 16
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should set loop_start and loop_end for looping clips", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      start: "2|1",
      length: "2:0",
      looping: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "start_marker",
      4, // start (2|1 = 4 beats) also sets start_marker
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "loop_start",
      4, // 2|1 in 4/4 = 4 Ableton beats
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "loop_end",
      12, // start (4) + length (8) = 12
    );

    expect(result).toStrictEqual({ id: "123" });
  });
});
