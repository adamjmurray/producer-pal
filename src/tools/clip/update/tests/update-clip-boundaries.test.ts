// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiSet, mockLiveApiGet } from "#src/test/mocks/mock-live-api.ts";
import {
  setupAudioClipMock,
  setupMidiClipMock,
  setupMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - Clip boundaries (shortening)", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("should set length without explicit start using current loop_start", async () => {
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

    const result = await updateClip({
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

  it("should set firstStart for looping clips", async () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 1,
        end_marker: 16, // content boundary - must be > firstStart
      },
    });

    const result = await updateClip({
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

  it("should warn when firstStart provided for non-looping clips", async () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 0,
      },
    });

    const result = await updateClip({
      ids: "123",
      start: "1|1",
      length: "4:0",
      firstStart: "2|1",
      looping: false,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "firstStart parameter ignored for non-looping clips",
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should set end_marker for non-looping clips", async () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 0,
        end_marker: 16, // content boundary - must be > start_marker
      },
    });

    const result = await updateClip({
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

  it("should set loop_start and loop_end for looping clips", async () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 1,
        end_marker: 12, // content boundary - must be > start_marker
      },
    });

    const result = await updateClip({
      ids: "123",
      start: "2|1",
      length: "2:0",
      looping: true,
    });

    // start_marker is auto-set to match loop_start for looping clips
    // (set AFTER loop_end is expanded to avoid "Invalid syntax" errors)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "start_marker",
      4, // 2|1 in 4/4 = 4 Ableton beats
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

describe("updateClip - derived start warning (MIDI vs audio)", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("emits warning for non-looping MIDI clip with mismatched derived start", async () => {
    setupMidiClipMock("123", {
      looping: 0,
      start_marker: 0,
      end_marker: 4,
      length: 5, // derived start = 4 - 5 = -1 !== 0
    });

    await updateClip({ ids: "123", length: "4:0" });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Derived start"),
    );
  });

  it("does NOT emit warning for non-looping audio clip with mismatched derived start", async () => {
    vi.mocked(outlet).mockClear();

    setupAudioClipMock("123", {
      looping: 0,
      start_marker: 0,
      end_marker: 0.131,
      length: 0.262, // derived start = 0.131 - 0.262 = -0.131 !== 0
    });

    await updateClip({ ids: "123", length: "1:0" });

    expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
  });
});
