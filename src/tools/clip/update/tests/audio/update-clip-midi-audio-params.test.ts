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

describe("updateClip - audio params on a MIDI clip", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  // 0 dB and 0 semitones are values the call sent, not absences: named on the
  // entry like any other.
  it("reports them on the clip's own entry, not as a warning", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      name: "Renamed",
      gainDb: 0,
      pitchShift: 0,
    });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      reason: "gainDb/pitchShift ignored: the clip is MIDI",
    });
    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Renamed");
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("names only the audio params the call sent", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      name: "Renamed",
      warpMode: "Beats",
      warping: "true",
    });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      reason: "warpMode/warping ignored: the clip is MIDI",
    });
  });

  it("says nothing when the call sent no audio params", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({ id: "123", name: "Renamed" });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  // Nothing else was asked of the one clip named, so the reason is the error.
  // `warping: false` is a sent param too — it must not read as unsent.
  it("refuses a lone MIDI clip sent only an audio param", async () => {
    setupMidiClipMock(mocks.clip123);

    await expect(updateClip({ id: "123", warping: "false" })).rejects.toThrow(
      "warping ignored: the clip is MIDI",
    );
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("keeps the MIDI clip's slot as a skip in a mixed batch", async () => {
    setupMidiClipMock(mocks.clip123);
    setupAudioClipMock(mocks.clip456);

    const result = (await updateClip({
      id: "123, 456",
      gainDb: 3,
    })) as object[];

    expect(result[0]).toStrictEqual({
      id: "123",
      ok: false,
      reason: "gainDb ignored: the clip is MIDI",
    });
    expect(result[1]).toStrictEqual(expect.objectContaining({ id: "456" }));
    expect(result[1]).not.toHaveProperty("ok");
  });
});
