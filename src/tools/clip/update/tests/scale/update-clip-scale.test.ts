// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  LIVE_WITH_CLIP_SCALE,
  LIVE_WITHOUT_CLIP_SCALE,
  registerLiveVersion,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";

/**
 * The scale properties a clip was written, in order.
 * @param clip - The registered clip
 * @returns [property, value] pairs for the scale properties
 */
function scaleWrites(clip: RegisteredMockObject): unknown[][] {
  return clip.set.mock.calls.filter(([property]) =>
    ["root_note", "scale_name", "scale_mode"].includes(property as string),
  );
}

describe("updateClip - scale", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
  });

  it("sets a clip's own scale", async () => {
    const result = await updateClip({ id: "123", scale: "D Dorian" });

    expect(scaleWrites(mocks.clip123)).toStrictEqual([
      ["root_note", 2],
      ["scale_name", "Dorian"],
      ["scale_mode", 1],
    ]);
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("turns a clip's scale off with a blank", async () => {
    const result = await updateClip({ id: "123", scale: "" });

    expect(scaleWrites(mocks.clip123)).toStrictEqual([["scale_mode", 0]]);
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("gives every clip a lone scale, and each its own from a list", async () => {
    await updateClip({ id: "123,456", scale: "C Major" });

    expect(scaleWrites(mocks.clip123)).toStrictEqual(
      scaleWrites(mocks.clip456),
    );

    mocks.clip123.set.mockClear();
    mocks.clip456.set.mockClear();
    await updateClip({ id: "123,456", scale: "C Major,F# Minor" });

    expect(scaleWrites(mocks.clip123)[0]).toStrictEqual(["root_note", 0]);
    expect(scaleWrites(mocks.clip456)[0]).toStrictEqual(["root_note", 6]);
    expect(scaleWrites(mocks.clip456)[1]).toStrictEqual([
      "scale_name",
      "Minor",
    ]);
  });

  it("reports the flat spelling Live stores for a sharp root", async () => {
    const result = await updateClip({ id: "123", scale: "F# Minor" });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      scale: "Gb Minor",
      detail:
        "scale roots are spelled with flats, so F# comes back as Gb — same scale, set correctly",
    });
  });

  it("refuses a scale Live doesn't have before touching any clip", async () => {
    await expect(
      updateClip({ id: "123,456", name: "A,B", scale: "C Major,C Nonsense" }),
    ).rejects.toThrow("Invalid scale name 'Nonsense'");
    expect(mocks.clip123.set).not.toHaveBeenCalled();
    expect(mocks.clip456.set).not.toHaveBeenCalled();
  });

  it("refuses a list that doesn't name one scale per clip", async () => {
    await expect(
      updateClip({ id: "123,456", scale: "C Major,D Minor,E Dorian" }),
    ).rejects.toThrow(/scale/);
    expect(mocks.clip123.set).not.toHaveBeenCalled();
  });

  it("writes the scale before the notes", async () => {
    await updateClip({ id: "123", scale: "C Minor", notes: "C3 1|1" });

    const scaleOrder = mocks.clip123.set.mock.invocationCallOrder.at(-1);
    const addOrder = mocks.clip123.call.mock.calls
      .map(([method], i) =>
        method === "add_new_notes"
          ? mocks.clip123.call.mock.invocationCallOrder[i]
          : null,
      )
      .find((order) => order != null);

    expect(scaleWrites(mocks.clip123)).toHaveLength(3);
    expect(scaleOrder).toBeLessThan(addOrder as number);
  });

  describe("an audio clip", () => {
    beforeEach(() => {
      setupAudioClipMock(mocks.clip456);
    });

    it("ignores it and says so on the clip's entry", async () => {
      const result = await updateClip({
        id: "456",
        name: "A",
        scale: "C Major",
      });

      expect(scaleWrites(mocks.clip456)).toStrictEqual([]);
      expect(mocks.clip456.set).toHaveBeenCalledWith("name", "A");
      expect(result).toStrictEqual({
        id: "456",
        path: "t1/s1",
        detail: "scale ignored: the clip is audio",
      });
    });

    it("skips a clip it was the only ask of, and still scales the others", async () => {
      const result = await updateClip({ id: "123,456", scale: "C Major" });

      expect(result).toStrictEqual([
        { id: "123", path: "t0/s0" },
        {
          id: "456",
          ok: false,
          detail: "scale ignored: the clip is audio",
        },
      ]);
      expect(scaleWrites(mocks.clip123)).toHaveLength(3);
    });

    it("throws for a lone audio clip asked nothing else", async () => {
      await expect(updateClip({ id: "456", scale: "" })).rejects.toThrow(
        "scale ignored: the clip is audio",
      );
    });
  });

  describe("a Live whose clips have no scale", () => {
    beforeEach(() => {
      registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
    });

    it("applies the rest of the call and says the scale was ignored", async () => {
      const result = await updateClip({
        id: "123",
        name: "A",
        scale: "C Major",
      });

      expect(scaleWrites(mocks.clip123)).toStrictEqual([]);
      expect(mocks.clip123.set).toHaveBeenCalledWith("name", "A");
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/s0",
        detail: "scale ignored: requires Live 12.4.15 or later",
      });
    });

    it("skips a clip whose only ask was the scale", async () => {
      await expect(updateClip({ id: "123", scale: "" })).rejects.toThrow(
        "scale ignored: requires Live 12.4.15 or later",
      );
    });

    it("still refuses a scale Live doesn't have", async () => {
      await expect(
        updateClip({ id: "123", scale: "C Nonsense" }),
      ).rejects.toThrow("Invalid scale name 'Nonsense'");
    });
  });

  it("asks Live for its version once, however many clips", async () => {
    const asked = registerLiveVersion(LIVE_WITH_CLIP_SCALE);

    await updateClip({ id: "123,456", scale: "C Major" });

    expect(asked()).toBe(1);
  });

  it("does not ask for the version when the call sets no scale", async () => {
    const asked = registerLiveVersion(LIVE_WITH_CLIP_SCALE);

    await updateClip({ id: "123,456", name: "A,B" });

    expect(asked()).toBe(0);
  });
});
