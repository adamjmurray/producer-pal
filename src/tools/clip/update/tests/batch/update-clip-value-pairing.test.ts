// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateClip - per-clip string params", () => {
  let mocks: UpdateClipMocks;

  /** A two-bar 4/4 region, so a new start or length moves a real boundary. */
  const REGION = {
    loop_start: 0,
    loop_end: 8,
    start_marker: 0,
    end_marker: 8,
  };

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, REGION);
    setupMidiClipMock(mocks.clip456, REGION);
  });

  // A broadcast start beside a paired length: one covers both clips, the other
  // gives each its own.
  it("gives each clip its own length", async () => {
    await updateClip({ id: "123,456", start: "1|1", length: "1bar,2bar" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_end", 4);
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_end", 8);
  });

  it("applies a single length to every clip", async () => {
    await updateClip({ id: "123,456", start: "1|1", length: "1bar" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_end", 4);
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_end", 4);
  });

  it("gives each clip its own time signature", async () => {
    await updateClip({ id: "123,456", timeSignature: "4/4,3/4" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_numerator", 4);
    expect(mocks.clip456.set).toHaveBeenCalledWith("signature_numerator", 3);
  });

  it("gives each clip its own region start", async () => {
    await updateClip({ id: "123,456", start: "1|1,2|1" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 0);
    expect(mocks.clip456.set).toHaveBeenCalledWith("loop_start", 4);
  });

  it("gives each clip its own firstStart", async () => {
    await updateClip({
      id: "123,456",
      looping: true,
      firstStart: "1|1,2|1",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("start_marker", 0);
    expect(mocks.clip456.set).toHaveBeenCalledWith("start_marker", 4);
  });

  it("gives each clip its own quantizePitch", async () => {
    await updateClip({ id: "123,456", quantize: 1, quantizePitch: "C3,D3" });

    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "quantize_pitch",
      60,
      expect.any(Number),
      1,
    );
    expect(mocks.clip456.call).toHaveBeenCalledWith(
      "quantize_pitch",
      62,
      expect.any(Number),
      1,
    );
  });

  it("refuses an unreadable quantizePitch entry before touching a clip", async () => {
    await expect(
      updateClip({ id: "123,456", quantize: 1, quantizePitch: "C3,nope" }),
    ).rejects.toThrow('invalid note name "nope" for quantizePitch');

    expect(mocks.clip123.call).not.toHaveBeenCalled();
  });

  it("refuses a list that names a different number of clips", async () => {
    await expect(
      updateClip({ id: "123,456", length: "1bar,2bar,3bar" }),
    ).rejects.toThrow("id names 2 entries but length names 3 entries");

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  it("refuses an empty entry rather than guessing", async () => {
    await expect(updateClip({ id: "123,456", start: "1|1,," })).rejects.toThrow(
      'invalid start "1|1,," - it has an empty entry',
    );

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  // With one clip there is no list to pair, so the value stays whole — here
  // that makes it an unreadable meter rather than two readable ones.
  it("takes the whole value literally when the call names one clip", async () => {
    await expect(
      updateClip({ id: "123", timeSignature: "4/4,3/4" }),
    ).rejects.toThrow("Time signature must be in format");

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  it("refuses the whole call when one entry's meter won't parse", async () => {
    await expect(
      updateClip({ id: "123,456", timeSignature: "4/4,nope" }),
    ).rejects.toThrow("Time signature must be in format");

    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });
});
