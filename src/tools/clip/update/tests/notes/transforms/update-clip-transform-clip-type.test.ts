// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockMergeNoteTracking,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const C3 = {
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};

describe("updateClip - transforms for the other kind of clip", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, { length: 4 });
    setupAudioClipMock(mocks.clip456);
    mockMergeNoteTracking(mocks.clip123, [{ ...C3 }]);
  });

  it("refuses a lone MIDI clip's gain transform, with no warning", async () => {
    await expect(
      updateClip({ id: "123", transforms: "gain = 3" }),
    ).rejects.toThrow("gain ignored: the clip is MIDI");

    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses a lone audio clip's velocity transform, with no warning", async () => {
    await expect(
      updateClip({ id: "456", transforms: "velocity = 50" }),
    ).rejects.toThrow("velocity ignored: the clip is audio");

    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("answers each clip of a batch on its own entry", async () => {
    const result = await updateClip({ ids: "123,456", transforms: "gain = 3" });

    expect(result).toStrictEqual([
      { id: "123", ok: false, detail: "gain ignored: the clip is MIDI" },
      { id: "456", path: "t1/s1" },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses note-count ops on an audio clip", async () => {
    await expect(
      updateClip({ id: "456", transforms: "ratchet(2)" }),
    ).rejects.toThrow("ratchet ignored: the clip is audio");
  });

  it("keeps the entry, with a detail, when only part of the transform applies", async () => {
    const result = await updateClip({
      id: "456",
      transforms: "gain += 3\nvelocity = 50",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "456",
        detail: "velocity ignored: the clip is audio",
      }),
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("puts a MIDI clip's mixed transform on its entry too", async () => {
    const result = await updateClip({
      id: "123",
      transforms: "velocity = 50\ngain = 3",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "123",
        detail: "gain ignored: the clip is MIDI",
      }),
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses an audio clip's unparseable transform like a MIDI clip's", async () => {
    await expect(
      updateClip({ id: "456", transforms: "gain = =" }),
    ).rejects.toThrow("transform syntax error");

    expect(capturedWarnings()).toStrictEqual([]);
  });
});
