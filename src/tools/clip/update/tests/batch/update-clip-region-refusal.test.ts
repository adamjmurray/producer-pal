// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

  it("refuses a length list, writing nothing to the audio clip first", async () => {
    await expect(
      updateClip({ id: "123,456", gainDb: -6, name: "X", length: "1bar,2bar" }),
    ).rejects.toThrow('Invalid duration format: "1bar,2bar"');

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
