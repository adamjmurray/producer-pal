// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";

describe("updateClip - Clip boundaries (shortening)", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("should set length without explicit start using current loop_start", async () => {
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 4.0, // bar 2 beat 1 in 4/4
    });

    const result = await updateClip({
      id: "123",
      length: "2bar", // 8 beats = 2 bars
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "loop_end",
      12, // loop_start (4) + length (8) = 12
    );

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("should set firstStart for looping clips", async () => {
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      end_marker: 16, // content boundary - must be > firstStart
    });

    const result = await updateClip({
      id: "123",
      start: "1|1",
      length: "4bar",
      firstStart: "3|1",
      looping: true,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "start_marker",
      8, // 3|1 in 4/4 = 8 Ableton beats
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "loop_start",
      0, // 1|1 in 4/4 = 0 Ableton beats
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "loop_end",
      16, // start (0) + length (16) = 16
    );

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("reports firstStart on a non-looping clip's own entry", async () => {
    setupMidiClipMock(mocks.clip123, {
      looping: 0,
    });

    const result = await updateClip({
      id: "123",
      start: "1|1",
      length: "4bar",
      firstStart: "2|1",
      looping: false,
    });

    expect(capturedWarnings()).toHaveLength(0);
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      reason: "firstStart ignored: the clip is not looping",
    });
  });

  it("should set end_marker for non-looping clips", async () => {
    setupMidiClipMock(mocks.clip123, {
      looping: 0,
      end_marker: 16, // content boundary - must be > start_marker
    });

    const result = await updateClip({
      id: "123",
      start: "1|1",
      length: "4bar",
      looping: false,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "start_marker",
      0, // 1|1 in 4/4 = 0 Ableton beats
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "end_marker",
      16, // start (0) + length (16) = 16
    );

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("should set loop_start and loop_end for looping clips", async () => {
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      end_marker: 12, // content boundary - must be > start_marker
    });

    const result = await updateClip({
      id: "123",
      start: "2|1",
      length: "2bar",
      looping: true,
    });

    // start_marker is auto-set to match loop_start for looping clips
    // (set AFTER loop_end is expanded to avoid "Invalid syntax" errors)
    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "start_marker",
      4, // 2|1 in 4/4 = 4 Ableton beats
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "loop_start",
      4, // 2|1 in 4/4 = 4 Ableton beats
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "loop_end",
      12, // start (4) + length (8) = 12
    );

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });
});

// `length` with no `start` holds an unlooped clip's end and moves its start.
// That is what the param means here, so a call that only changes the length
// answers with a plain entry.
describe("updateClip - length alone on a non-looping clip", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    clearCapturedWarnings();
  });

  it.each([
    ["MIDI", setupMidiClipMock, { end_marker: 4, length: 5 }, "4bar"],
    ["audio", setupAudioClipMock, { end_marker: 0.131, length: 0.262 }, "1bar"],
  ])(
    "says nothing about the start it derived on a %s clip",
    async (_kind, setupMock, props, length) => {
      setupMock(mocks.clip123, { looping: 0, start_marker: 0, ...props });

      const result = (await updateClip({ id: "123", length })) as {
        reason?: string;
      };

      expect(result.reason).toBeUndefined();
      expect(capturedWarnings()).toHaveLength(0);
    },
  );
});
