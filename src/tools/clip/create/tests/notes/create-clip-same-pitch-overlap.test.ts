// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import { createClip } from "../../create-clip.ts";
import { setupSessionMocks } from "../create-clip-test-helpers.ts";

type Written = { pitch: number; start_time: number; duration: number };

/**
 * Make the clip hold notes the way Live does: of two overlapping notes at one
 * pitch, the earlier is cut at the later one's start. `cuts: false` keeps them
 * as written.
 * @param clip - The clip mock
 * @param cuts - Whether Live cuts overlapping notes
 */
function liveHolds(clip: RegisteredMockObject, cuts = true): void {
  let held: Written[] = [];

  clip.call.mockImplementation((method: string, ...args: unknown[]) => {
    if (method === "add_new_notes") {
      const sorted = (args[0] as { notes: Written[] }).notes.toSorted(
        (a, b) => a.pitch - b.pitch || a.start_time - b.start_time,
      );

      held = sorted.map((note, i) => {
        const next = sorted[i + 1];

        return cuts &&
          next?.pitch === note.pitch &&
          next.start_time < note.start_time + note.duration
          ? { ...note, duration: next.start_time - note.start_time }
          : note;
      });
    }

    return method === "get_notes_extended"
      ? JSON.stringify({ notes: held })
      : null;
  });
}

/**
 * @param clip - The clip mock
 * @returns How many times the clip's notes were read back
 */
function readsOf(clip: RegisteredMockObject): number {
  return clip.call.mock.calls.filter(
    ([method]) => method === "get_notes_extended",
  ).length;
}

/**
 * @param result - A create-clip result with one clip
 * @returns The clip entry's detail
 */
function detailOf(result: unknown): string | undefined {
  return (result as { detail?: string }).detail;
}

const SIX_EIGHT = { signature_numerator: 6, signature_denominator: 8 };
const FOUR_FOUR = { signature_numerator: 4, signature_denominator: 4 };

describe("createClip - notes Live cut short at one pitch", () => {
  it("counts the notes the next note at their pitch cut, in any meter", async () => {
    const { clip } = setupSessionMocks({ liveSet: SIX_EIGHT });

    liveHolds(clip);

    // In 6/8 a beat is an eighth, so quarter notes one beat apart overlap
    const result = await createClip({ slot: "0/0", notes: "n/4 C1 1|1,2,3" });

    expect(detailOf(result)).toBe(
      "2 notes shortened by the next note at the same pitch",
    );
  });

  it("says 1 note, not 1 notes", async () => {
    const { clip } = setupSessionMocks({ liveSet: FOUR_FOUR });

    liveHolds(clip);

    const result = await createClip({ slot: "0/0", notes: "n/2 C1 1|1,2" });

    expect(detailOf(result)).toBe(
      "1 note shortened by the next note at the same pitch",
    );
  });

  it("says nothing, and reads nothing back, when notes don't overlap", async () => {
    const { clip } = setupSessionMocks({ liveSet: SIX_EIGHT });

    liveHolds(clip);

    const result = await createClip({ slot: "0/0", notes: "n/8 C1 1|1,2,3" });

    expect(detailOf(result)).toBeUndefined();
    // Only the read that counts the notes
    expect(readsOf(clip)).toBe(1);
  });

  it("says nothing for overlapping notes at different pitches", async () => {
    const { clip } = setupSessionMocks({ liveSet: FOUR_FOUR });

    liveHolds(clip);

    const result = await createClip({
      slot: "0/0",
      notes: "n/2 C1 1|1 D1 1|2",
    });

    expect(detailOf(result)).toBeUndefined();
  });

  it("says nothing when Live kept the notes as written", async () => {
    const { clip } = setupSessionMocks({ liveSet: FOUR_FOUR });

    liveHolds(clip, false);

    const result = await createClip({ slot: "0/0", notes: "n/2 C1 1|1,2" });

    expect(detailOf(result)).toBeUndefined();
  });

  it("counts the notes a transform made overlap", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { ...FOUR_FOUR, scale_mode: 0 },
    });

    liveHolds(clip);

    const result = await createClip({
      slot: "0/0",
      notes: "n/2 C1 1|1,3",
      transforms: "duration = 3",
    });

    expect(detailOf(result)).toContain(
      "1 note shortened by the next note at the same pitch",
    );
  });
});
