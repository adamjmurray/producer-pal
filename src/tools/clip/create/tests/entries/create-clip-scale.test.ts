// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import {
  registerMockObject,
  simulateMockWrites,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failOnSet,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import {
  LIVE_WITH_CLIP_SCALE,
  LIVE_WITHOUT_CLIP_SCALE,
  registerLiveVersion,
  registerSongScale,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { createClip } from "../../create-clip.ts";
import { setupSessionAudioClipMocks } from "../create-clip-test-helpers.ts";
import {
  twoSessionSlots,
  type SessionSlot,
} from "../notes/session-slot-test-helpers.ts";

const METER = { signature_numerator: 4, signature_denominator: 4 };

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

/**
 * Two empty session slots, in a Set with the given scale.
 * @param song - The Live Set's scale properties
 * @returns The slots
 */
function slotsInSet(
  song: Parameters<typeof registerSongScale>[0] = {},
): [SessionSlot, SessionSlot] {
  const slots = twoSessionSlots();

  registerSongScale(song, METER);

  return slots;
}

describe("createClip - scale", () => {
  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    // Live keeps the scale it was given, so a read-back sees what was written.
    simulateMockWrites();
  });

  it("gives a new clip the scale asked for", async () => {
    const [first] = slotsInSet();

    const result = await createClip({ path: "t0/s0", scale: "D Dorian" });

    expect(scaleWrites(first.clip)).toStrictEqual([
      ["root_note", 2],
      ["scale_name", "Dorian"],
      ["scale_mode", 1],
    ]);
    expect(result).toStrictEqual({ id: "clip-0-0", path: "t0/s0" });
  });

  it("leaves the scale a new clip starts with alone when none is asked for", async () => {
    const [first] = slotsInSet();

    await createClip({ path: "t0/s0", name: "A" });

    expect(scaleWrites(first.clip)).toStrictEqual([]);
  });

  it("switches a new clip's scale off with a blank", async () => {
    const [first] = slotsInSet({ scale_mode: 1 });

    await createClip({ path: "t0/s0", scale: "" });

    expect(scaleWrites(first.clip)).toStrictEqual([["scale_mode", 0]]);
  });

  it("gives every clip a lone scale", async () => {
    const [first, second] = slotsInSet();

    await createClip({ path: "t0/s0,t0/s1", scale: "C Major" });

    expect(scaleWrites(first.clip)).toStrictEqual(scaleWrites(second.clip));
    expect(scaleWrites(first.clip)).toHaveLength(3);
  });

  it("gives each clip its own scale from a list", async () => {
    const [first, second] = slotsInSet();

    await createClip({ path: "t0/s0,t0/s1", scale: "C Major,F# Minor" });

    expect(scaleWrites(first.clip)[0]).toStrictEqual(["root_note", 0]);
    expect(scaleWrites(second.clip)[0]).toStrictEqual(["root_note", 6]);
  });

  it("writes the scale before the notes", async () => {
    const [first] = slotsInSet();

    await createClip({ path: "t0/s0", scale: "C Minor", notes: "C3 1|1" });

    const scaleOrder = first.clip.set.mock.invocationCallOrder.at(-1);
    const addIndex = first.clip.call.mock.calls.findIndex(
      ([method]) => method === "add_new_notes",
    );

    expect(addIndex).toBeGreaterThanOrEqual(0);
    expect(scaleOrder).toBeLessThan(
      first.clip.call.mock.invocationCallOrder[addIndex] as number,
    );
  });

  it("reports the flat spelling Live stores for a sharp root", async () => {
    slotsInSet();

    const result = await createClip({ path: "t0/s0", scale: "F# Minor" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "clip-0-0",
        scale: "Gb Minor",
        detail:
          "scale roots are spelled with flats, so F# comes back as Gb — same scale, set correctly",
      }),
    );
  });

  it("refuses a scale Live doesn't have before creating anything", async () => {
    const [first] = slotsInSet();

    await expect(
      createClip({ path: "t0/s0,t0/s1", scale: "C Major,C Nonsense" }),
    ).rejects.toThrow("Invalid scale name 'Nonsense'");
    expect(first.clipSlot.call).not.toHaveBeenCalledWith(
      "create_clip",
      expect.anything(),
    );
  });

  it("refuses a list that doesn't name one scale per clip", async () => {
    const [first] = slotsInSet();

    await expect(
      createClip({ path: "t0/s0,t0/s1", scale: "C Major,D Minor,E Dorian" }),
    ).rejects.toThrow("path names 2 entries but scale names 3 entries");
    expect(first.clipSlot.call).not.toHaveBeenCalled();
  });

  it("keeps the clip, and says the scale changed, when Live stops partway", async () => {
    const [first] = slotsInSet();

    failOnSet(first.clip, "scale_name");

    const result = await createClip({ path: "t0/s0", scale: "C Major" });

    expect(result).toStrictEqual({
      id: "clip-0-0",
      path: "t0/s0",
      detail: `${LIVE_FAILURE}; already changed: clip created, properties, scale`,
    });
  });

  it("makes an audio clip and says the scale does nothing on it", async () => {
    const { clip } = setupSessionAudioClipMocks();

    const result = await createClip({
      path: "t0/s0",
      sampleFile: "/path/to/kick.wav",
      scale: "C Major",
    });

    expect(scaleWrites(clip)).toStrictEqual([]);
    expect(result).toStrictEqual(
      expect.objectContaining({ detail: "scale ignored: the clip is audio" }),
    );
  });

  describe("on a Live whose clips have no scale", () => {
    beforeEach(() => {
      registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
    });

    it("makes the clip as asked and says the scale was ignored", async () => {
      const [first] = slotsInSet();

      const result = await createClip({
        path: "t0/s0",
        name: "A",
        scale: "C Major",
      });

      expect(scaleWrites(first.clip)).toStrictEqual([]);
      expect(first.clip.set).toHaveBeenCalledWith("name", "A");
      expect(result).toStrictEqual({
        id: "clip-0-0",
        path: "t0/s0",
        detail: "scale ignored: requires Live 12.4.15 or later",
      });
    });

    it("still refuses a scale Live doesn't have", async () => {
      slotsInSet();

      await expect(
        createClip({ path: "t0/s0", scale: "C Nonsense" }),
      ).rejects.toThrow("Invalid scale name 'Nonsense'");
    });
  });

  it("stops before creating anything when Live's version can't be read", async () => {
    const [first] = slotsInSet();

    registerMockObject("live_app", {
      path: "live_app",
      methods: {
        get_version_string: () => {
          throw new Error("no version");
        },
      },
    });

    await expect(
      createClip({ path: "t0/s0,t0/s1", scale: "C Major" }),
    ).rejects.toThrow("no version");
    expect(first.clipSlot.call).not.toHaveBeenCalled();
  });

  it("asks Live for its version once for the whole call", async () => {
    const asked = registerLiveVersion(LIVE_WITH_CLIP_SCALE);

    slotsInSet();
    await createClip({ path: "t0/s0,t0/s1", scale: "C Major" });

    expect(asked()).toBe(1);
  });

  it("does not ask Live for its version when no scale is sent", async () => {
    const asked = registerLiveVersion(LIVE_WITH_CLIP_SCALE);

    slotsInSet();
    await createClip({ path: "t0/s0,t0/s1", name: "A,B" });

    expect(asked()).toBe(0);
  });
});
