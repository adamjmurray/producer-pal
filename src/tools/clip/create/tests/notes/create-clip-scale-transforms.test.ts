// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A new clip has no scale to read yet, so its transforms snap to the scale the
// call asks for, or else the Live Set's, which every new clip starts with.

import { beforeEach, describe, expect, it } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  C_MAJOR_INTERVALS,
  LIVE_WITH_CLIP_SCALE,
  LIVE_WITHOUT_CLIP_SCALE,
  registerLiveVersion,
  registerSongScale,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { createClip } from "../../create-clip.ts";
import {
  twoSessionSlots,
  type SessionSlot,
} from "./session-slot-test-helpers.ts";

const METER = { signature_numerator: 4, signature_denominator: 4 };
// C#3 is out of every scale used here. C major sends it up to D (62); C minor
// pentatonic sends it down to C (60).
const SNAP = { notes: "C#3 1|1", transforms: "pitch = snap(note.pitch)" };

/**
 * The pitch of the note written to a clip.
 * @param clip - The registered clip
 * @returns The pitch
 */
function writtenPitch(clip: RegisteredMockObject): number {
  const call = clip.call.mock.calls.find(([m]) => m === "add_new_notes") as [
    string,
    { notes: { pitch: number }[] },
  ];

  return call[1].notes[0]?.pitch as number;
}

/**
 * Two empty session slots, in a Set with the given scale on.
 * @param on - Whether the Live Set's scale is on
 * @returns The slots
 */
function slotsInSet(on = true): [SessionSlot, SessionSlot] {
  const slots = twoSessionSlots();

  registerSongScale(
    { scale_mode: on ? 1 : 0, scale_intervals: C_MAJOR_INTERVALS },
    METER,
  );

  return slots;
}

describe("createClip - transforms follow the new clip's scale", () => {
  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
  });

  it("snaps to the scale the call asks for, not the Live Set's", async () => {
    const [first] = slotsInSet();

    await createClip({ path: "t0/s0", scale: "C Minor Pentatonic", ...SNAP });

    expect(writtenPitch(first.clip)).toBe(60);
  });

  it("snaps to the scale the call asks for when the Live Set has none", async () => {
    const [first] = slotsInSet(false);

    await createClip({ path: "t0/s0", scale: "C Minor Pentatonic", ...SNAP });

    expect(writtenPitch(first.clip)).toBe(60);
  });

  it("snaps to the Live Set's scale, which a new clip starts with, when none is asked for", async () => {
    const [first] = slotsInSet();

    await createClip({ path: "t0/s0", ...SNAP });

    expect(writtenPitch(first.clip)).toBe(62);
  });

  it("does not snap when the call switches the clip's scale off", async () => {
    const [first] = slotsInSet();

    await createClip({ path: "t0/s0", scale: "", ...SNAP });

    expect(writtenPitch(first.clip)).toBe(61);
  });

  it("snaps each clip of a list to its own scale", async () => {
    const [first, second] = slotsInSet();

    await createClip({
      path: "t0/s0,t0/s1",
      scale: "C Minor Pentatonic,C Major",
      ...SNAP,
    });

    expect(writtenPitch(first.clip)).toBe(60);
    expect(writtenPitch(second.clip)).toBe(62);
  });

  describe("on a Live whose clips have no scale", () => {
    beforeEach(() => {
      registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
    });

    it("snaps to the Live Set's scale whatever scale is asked for", async () => {
      const [first] = slotsInSet();

      await createClip({ path: "t0/s0", scale: "C Minor Pentatonic", ...SNAP });

      expect(writtenPitch(first.clip)).toBe(62);
    });
  });
});
