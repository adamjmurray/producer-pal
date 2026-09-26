// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  mockMergeNoteTracking,
  note,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

type ClipMock = UpdateClipMocks[keyof UpdateClipMocks];

/**
 * Assert a clip got no writes.
 * @param clip - The clip mock to check
 */
function expectUntouched(clip: ClipMock): void {
  expect(clip.set).not.toHaveBeenCalled();

  const calls = clip.call.mock.calls.map(([method]) => method);

  expect(
    calls.filter((method) => method !== "get_notes_extended"),
  ).toStrictEqual([]);
}

describe("updateClip - unreadable note edits refused before the clip is touched", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("writes nothing to either clip for notes it can't parse", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    const result = await updateClip({
      id: "123,456",
      name: "X,Y",
      notes: "C3 1|1 ((",
    });

    expect(result).toStrictEqual([
      expect.objectContaining({ id: "123", ok: false }),
      expect.objectContaining({ id: "456", ok: false }),
    ]);
    expectUntouched(mocks.clip123);
    expectUntouched(mocks.clip456);
  });

  // 1|5 is the next bar's downbeat in 4/4, so the range is a point there; in
  // 3/4 it lands past 2|1 and the range runs backwards.
  it("refuses a range in the one clip whose meter can't read it", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456, {
      signature_numerator: 3,
      signature_denominator: 4,
    });
    mockMergeNoteTracking(mocks.clip123, [note(60, 4)]);
    mockMergeNoteTracking(mocks.clip456, [note(60, 3)]);

    const result = (await updateClip({
      id: "123,456",
      name: "X,Y",
      transforms: "1|5-2|1: velocity = 1",
    })) as object[];

    expect(result[0]).not.toHaveProperty("ok");
    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "X");
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
    expect(result[1]).toStrictEqual({
      id: "456",
      ok: false,
      detail: expect.stringContaining("Invalid time range"),
    });
    expectUntouched(mocks.clip456);
  });

  it("doubles nothing when the transforms can't be parsed", async () => {
    setupMidiClipMock(mocks.clip123);
    mockMergeNoteTracking(mocks.clip123, [note(60)]);

    await expect(
      updateClip({
        id: "123",
        duplicateLoop: true,
        transforms: "velocity = = 1",
      }),
    ).rejects.toThrow("transform syntax error");

    expectUntouched(mocks.clip123);
  });

  it.each([
    ["with notes", [note(60)]],
    ["with no notes", []],
  ])("refuses bad preTransforms on a clip %s", async (_label, existing) => {
    setupMidiClipMock(mocks.clip123);
    mockMergeNoteTracking(mocks.clip123, existing);

    await expect(
      updateClip({ id: "123", name: "X", preTransforms: "velocity = = 1" }),
    ).rejects.toThrow("transform syntax error");

    expectUntouched(mocks.clip123);
  });

  it("refuses bad transforms even when the notes leave none to act on", async () => {
    setupMidiClipMock(mocks.clip123);

    await expect(
      updateClip({
        id: "123",
        name: "X",
        notes: "v0 C3 1|1",
        transforms: "velocity = = 1",
      }),
    ).rejects.toThrow("transform syntax error");

    expectUntouched(mocks.clip123);
  });

  it.each([
    ["stark", "melody: ((", "Stark notation parse error"],
    ["midi-json", "[{p:60", "Invalid MIDI JSON"],
  ] as const)(
    "refuses %s notes it can't parse",
    async (notation, notes, error) => {
      setupMidiClipMock(mocks.clip123);

      await expect(
        updateClip({ id: "123", name: "X", notes }, { notation }),
      ).rejects.toThrow(error);

      expectUntouched(mocks.clip123);
    },
  );

  // The range is only valid in 4/4 (see above).
  it("parses in the meter the call sets", async () => {
    setupMidiClipMock(mocks.clip123, {
      signature_numerator: 3,
      signature_denominator: 4,
    });
    setupMidiClipMock(mocks.clip456);
    mockMergeNoteTracking(mocks.clip123, [note(60, 4)]);
    mockMergeNoteTracking(mocks.clip456, [note(60, 4)]);

    const transforms = "1|5-2|1: velocity = 1";

    await updateClip({ id: "123", timeSignature: "4/4", transforms });
    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_numerator", 4);

    await expect(
      updateClip({ id: "456", timeSignature: "3/4", transforms }),
    ).rejects.toThrow("Invalid time range");
    expectUntouched(mocks.clip456);
  });
});

describe("updateClip - note edits the clip ignores", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("still only warns on an audio clip's unparseable transforms", async () => {
    setupAudioClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      name: "X",
      notes: "C3 1|1 ((",
      transforms: "gain = = 1",
    });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      detail: "notes ignored: the clip is audio",
    });
    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "X");
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("Failed to parse transform string"),
    );
  });

  it("still ignores valid transforms on a MIDI clip with no notes", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      name: "X",
      transforms: "velocity = 1",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "123",
        detail: "transforms ignored: the clip has no notes",
      }),
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "X");
  });
});
