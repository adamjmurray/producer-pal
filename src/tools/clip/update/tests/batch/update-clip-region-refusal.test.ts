// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

// A bad start/length/firstStart used to surface inside each clip's update,
// after an audio clip's gain and warp had already been written, and the clip
// then came back ok:false as though nothing had landed.
describe("updateClip - unreadable region refused before any clip is touched", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupAudioClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
  });

  const expectNothingWritten = (): void => {
    for (const clip of [mocks.clip123, mocks.clip456]) {
      expect(clip.set).not.toHaveBeenCalled();
      expect(clip.call).not.toHaveBeenCalled();
    }
  };

  it("refuses a bad entry in a length list, writing nothing to the audio clip first", async () => {
    await expect(
      updateClip({ id: "123,456", gainDb: -6, name: "X", length: "1bar,n/0" }),
    ).rejects.toThrow("division by zero");

    expectNothingWritten();
  });

  it.each([
    ["start", { start: "1-1" }, "Invalid bar|beat format"],
    ["start", { start: "0|1" }, "bars are 1-indexed"],
    ["firstStart", { firstStart: "1|0" }, "beats are 1-indexed"],
    ["length", { length: "n/0" }, "division by zero"],
  ])("refuses a bad %s (%j)", async (_param, region, message) => {
    await expect(
      updateClip({ id: "123,456", gainDb: -6, looping: true, ...region }),
    ).rejects.toThrow(message);

    expectNothingWritten();
  });

  // firstStart does nothing on a clip that won't loop, but a value that can't
  // be read is still a mistake in the call (matches create-clip).
  it("refuses a bad firstStart even when no clip loops", async () => {
    await expect(
      updateClip({ id: "123,456", name: "X", firstStart: "one" }),
    ).rejects.toThrow("Invalid bar|beat format");

    expectNothingWritten();
  });
});

// Live ignores a length that spans nothing, and a start at or past a looping
// clip's end, and keeps the region it had. Both came back as plain entries.
describe("updateClip - a region Live would not hold", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    // A looping clip at 5|1 to 6|1
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 16,
      loop_end: 20,
    });
    setupMidiClipMock(mocks.clip456, {
      looping: 1,
      loop_start: 0,
      loop_end: 40,
    });
  });

  it.each(["0bar", "n0/4"])(
    "refuses a length of %s before anything is written",
    async (length) => {
      await expect(updateClip({ id: "123,456", length })).rejects.toThrow(
        `length "${length}" must be longer than zero`,
      );
      expect(mocks.clip123.set).not.toHaveBeenCalled();
      expect(mocks.clip456.set).not.toHaveBeenCalled();
    },
  );

  it("refuses one empty length in a list, writing nothing", async () => {
    await expect(
      updateClip({ id: "123,456", length: "1bar,0bar" }),
    ).rejects.toThrow('length "0bar" must be longer than zero');
    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  // Whether it spans anything depends on the clip's meter: a bar of 4/4 minus
  // a whole note is nothing, a bar of 5/4 minus one is a beat.
  it("skips a clip whose meter makes the length empty, and writes the rest", async () => {
    setupMidiClipMock(mocks.clip456, {
      looping: 1,
      signature_numerator: 5,
      loop_start: 0,
      loop_end: 8,
    });

    const result = await updateClip({ id: "123,456", length: "1bar-n/1" });

    expect(result).toStrictEqual([
      {
        id: "123",
        ok: false,
        detail: 'length "1bar-n/1" must be longer than zero',
      },
      { id: "456", path: "t1/s1" },
    ]);
    expect(mocks.clip123.set).not.toHaveBeenCalled();
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_end", 1);
  });

  it("skips a looping clip whose start is not before its loop end", async () => {
    const result = await updateClip({ id: "123,456", start: "9|1" });

    expect(result).toStrictEqual([
      {
        id: "123",
        ok: false,
        detail:
          'start "9|1" is not before the loop end at 6|1: send a length too, or an earlier start',
      },
      { id: "456", path: "t1/s1" },
    ]);
    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  // Turning looping on restates the region that was playing, so the unlooped
  // clip's end_marker is the loop end the start is held against.
  it("holds a start against the end of the region a looping toggle carries over", async () => {
    setupMidiClipMock(mocks.clip123, {
      looping: 0,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 16,
    });

    expect(
      await updateClip({ id: "123", looping: true, start: "2|1" }),
    ).toStrictEqual({ id: "123", path: "t0/s0" });
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 4);

    await expect(
      updateClip({ id: "123", looping: true, start: "5|1" }),
    ).rejects.toThrow('start "5|1" is not before the loop end at 5|1');
  });

  it("does not hold a start against a loop end once looping goes off", async () => {
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 16,
    });

    // 4 beats is the loop end, but the unlooped region reads the markers: the
    // start isn't refused. It can't land either (the region that carries over
    // ends there), and the read-back says so.
    expect(
      await updateClip({ id: "123", looping: false, start: "2|1" }),
    ).toStrictEqual({
      id: "123",
      path: "t0/s0",
      start: "1|1",
      detail: "start read back as shown, not as sent",
    });
  });

  it("takes that start when a length moves the end with it", async () => {
    expect(
      await updateClip({ id: "123", start: "9|1", length: "1bar" }),
    ).toStrictEqual({
      id: "123",
      path: "t0/s0",
    });
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 32);
  });
});

describe("updateClip - region in odd meters", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  // Beat 7 only fits a bar of 7 or more, so a check run in any one meter would
  // warn or refuse it for the others.
  it("reads one region in each clip's own meter", async () => {
    const meter = (numerator: number, denominator: number) => ({
      looping: 1,
      signature_numerator: numerator,
      signature_denominator: denominator,
      end_marker: 64,
    });

    setupMidiClipMock(mocks.clip123, meter(7, 8));
    setupMidiClipMock(mocks.clip456, meter(9, 16));

    const result = await updateClip({
      id: "123,456",
      start: "1|7",
      length: "1bar+n/8",
    });

    expect(result).toStrictEqual([
      { id: "123", path: "t0/s0" },
      { id: "456", path: "t1/s1" },
    ]);
    // 7/8: beat 7 is 6 eighths in (3 quarters); a bar is 3.5 quarters.
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 3);
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_end", 7);
    // 9/16: beat 7 is 6 sixteenths in (1.5 quarters); a bar is 2.25 quarters.
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_start", 1.5);
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_end", 4.25);
    expect(capturedWarnings()).toHaveLength(0);
  });
});
