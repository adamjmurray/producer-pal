// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import {
  expectClipUntouched,
  mockMergeNoteTracking,
  note,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

// A mistake in the transform text is the same for every clip, so the call is
// refused once, before any clip is touched.
describe("updateClip - a bad transform argument is refused before any clip is touched", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
    mockMergeNoteTracking(mocks.clip123, [note(60)]);
    mockMergeNoteTracking(mocks.clip456, [note(60)]);
  });

  it.each([
    ["transforms", { transforms: "ratchet(0)" }],
    ["preTransforms", { preTransforms: "ratchet(0)" }],
  ])("refuses %s for every clip", async (_label, edit) => {
    await expect(
      updateClip({ id: "123,456", name: "X,Y", ...edit }),
    ).rejects.toThrow("ratchet() needs a count of 2 or more");

    expectClipUntouched(mocks.clip123);
    expectClipUntouched(mocks.clip456);
  });

  it("refuses a duplicate selector", async () => {
    await expect(
      updateClip({ id: "123", name: "X", transforms: "C3: E3: velocity = 1" }),
    ).rejects.toThrow('Bad selector "C3: E3:": duplicate pitch selector');

    expectClipUntouched(mocks.clip123);
  });

  it.each([
    ["ratchet(1)", "ratchet() needs a count of 2 or more"],
    ["velocity = C3", `note name "C3" isn't a value for velocity`],
    ["velocity = rand(1, 2, 3)", "rand() needs 0-2 arguments"],
    ["C3: E3: velocity = 1", "duplicate pitch selector"],
    ["gain = C3", `pitch name "C3" isn't a value for gain`],
  ])(
    "refuses %s for a MIDI and an audio clip together, touching neither",
    async (transforms, message) => {
      setupAudioClipMock(mocks.clip456);

      await expect(
        updateClip({ id: "123,456", name: "X,Y", transforms }),
      ).rejects.toThrow(message);

      expectClipUntouched(mocks.clip123);
      expectClipUntouched(mocks.clip456);
    },
  );

  it("refuses a pitch name used as a gain on an audio clip", async () => {
    setupAudioClipMock(mocks.clip456);

    await expect(
      updateClip({ id: "456", name: "X", transforms: "gain = C3" }),
    ).rejects.toThrow(`pitch name "C3" isn't a value for gain`);

    expectClipUntouched(mocks.clip456);
  });

  it("leaves an argument only known as the transform runs to the clip", async () => {
    // rand() can't be judged before the notes are: the call goes ahead and the
    // clip says what happened.
    await updateClip({ id: "123", transforms: "ratchet(rand(0, 0))" });

    expect(capturedWarnings()).toStrictEqual([
      expect.stringContaining("needs a count of 2 or more"),
    ]);
  });
});
