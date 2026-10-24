// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
      detail: "firstStart ignored: the clip is not looping",
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

// The region is read back once it is written: Live keeps the old one when it
// can't hold the new one, and the entry says what the clip has.
describe("updateClip - region Live kept in place of the one asked for", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  /**
   * A looping clip at 5|1 to 6|1 that Live takes no region write on.
   * @param props - More properties the case pins
   */
  function liveHoldsRegion(props: Record<string, unknown> = {}): void {
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 16,
      loop_end: 20,
      start_marker: 16,
      end_marker: 20,
      ...props,
    });
    mocks.clip123.set.mockImplementation(() => undefined);
  }

  it("reports the start and length Live kept", async () => {
    liveHoldsRegion();

    expect(
      await updateClip({ id: "123", start: "1|1", length: "2bar" }),
    ).toStrictEqual({
      id: "123",
      path: "t0/s0",
      start: "5|1",
      length: "1bar",
      detail: "start, length read back as shown, not as sent",
    });
  });

  it("names only the one that differs", async () => {
    liveHoldsRegion();

    expect(
      await updateClip({ id: "123", start: "5|1", length: "2bar" }),
    ).toStrictEqual({
      id: "123",
      path: "t0/s0",
      length: "1bar",
      detail: "length read back as shown, not as sent",
    });
  });

  it("says nothing when the region landed as asked", async () => {
    setupMidiClipMock(mocks.clip123, { looping: 1, end_marker: 32 });

    expect(
      await updateClip({ id: "123", start: "1|3", length: "2bar" }),
    ).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("says nothing about a start that differs below a thousandth of a beat", async () => {
    liveHoldsRegion({ loop_start: 2.0001, loop_end: 10.0001 });

    expect(
      await updateClip({ id: "123", start: "1|3", length: "2bar" }),
    ).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  // Live stores a 32-bit float: a position on a rounding boundary reads back a
  // thousandth off once stored, and that is still the position written.
  it("says nothing about a start and length Live stored as float32", async () => {
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      signature_numerator: 7,
      signature_denominator: 8,
      end_marker: 64,
    });
    const keepsWrites = mocks.clip123.set.getMockImplementation();

    mocks.clip123.set.mockImplementation((prop: string, value: unknown) => {
      keepsWrites?.(
        prop,
        typeof value === "number" ? Math.fround(value) : value,
      );
    });

    // 1.0035 beats from the start, and a length of 1.0035 beats
    expect(
      await updateClip({ id: "123", start: "1|2.007", length: "n1.0035/4" }),
    ).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("reports the start of an unlooped clip that Live left where it was", async () => {
    liveHoldsRegion({ looping: 0, start_marker: 0, end_marker: 4 });

    expect(await updateClip({ id: "123", start: "3|1" })).toStrictEqual({
      id: "123",
      path: "t0/s0",
      start: "1|1",
      detail: "start read back as shown, not as sent",
    });
  });

  it("reads an audio clip through the same region the read tools publish", async () => {
    setupAudioClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 16,
    });
    mocks.clip123.set.mockImplementation(() => undefined);

    expect(await updateClip({ id: "123", length: "2bar" })).toStrictEqual({
      id: "123",
      path: "t0/s0",
      length: "1bar",
      detail: "length read back as shown, not as sent",
    });
  });
});

// Live changes a time signature it can't hold, and every position the update
// reads or writes is in the meter the clip ends up with.
describe("updateClip - time signature Live kept in place of the one asked for", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 0,
      loop_end: 4,
    });
  });

  it("refuses a denominator Live would change, writing nothing", async () => {
    await expect(
      updateClip({ id: "123", timeSignature: "4/3" }),
    ).rejects.toThrow('timeSignature "4/3" has a denominator Live can\'t keep');
    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  it("says nothing when Live kept the time signature", async () => {
    expect(await updateClip({ id: "123", timeSignature: "7/8" })).toStrictEqual(
      { id: "123", path: "t0/s0" },
    );
  });

  it("reports the one Live kept, and reads the region in it", async () => {
    const keepsWrites = mocks.clip123.set.getMockImplementation();

    // Live clamps the numerator it can't hold.
    mocks.clip123.set.mockImplementation((prop: string, value: unknown) => {
      keepsWrites?.(prop, prop === "signature_numerator" ? 1 : value);
    });

    expect(
      await updateClip({
        id: "123",
        timeSignature: "100/32",
        start: "1|1",
        length: "1bar",
      }),
    ).toStrictEqual({
      id: "123",
      path: "t0/s0",
      timeSignature: "1/32",
      detail: "timeSignature read back as shown, not as sent",
    });
    // One bar of 1/32 is an eighth of a beat.
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_end", 0.125);
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
        detail?: string;
      };

      expect(result.detail).toBeUndefined();
      expect(capturedWarnings()).toHaveLength(0);
    },
  );
});
