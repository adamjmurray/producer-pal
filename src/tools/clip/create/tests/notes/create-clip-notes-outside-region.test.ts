// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createClip } from "../../create-clip.ts";
import { setupSessionMocks } from "../create-clip-test-helpers.ts";

const FOUR_FOUR = { signature_numerator: 4, signature_denominator: 4 };

// The mock clip plays beats 0 to 4, as a 1-bar clip does in Live.
const ONE_BAR_CLIP = { length: 4, loop_end: 4, end_marker: 4 };

/**
 * @param result - A create-clip result with one clip
 * @returns The clip entry's detail
 */
function detailOf(result: unknown): string | undefined {
  return (result as { detail?: string }).detail;
}

describe("createClip - notes written outside the region", () => {
  it("counts the notes that start past the end of a clip with a set length", async () => {
    setupSessionMocks({ liveSet: FOUR_FOUR, clip: ONE_BAR_CLIP });

    const result = await createClip({
      slot: "0/0",
      length: "1bar",
      notes: "C3 1|1 D3 1|5 E3 1|7.75 F3 2|1",
    });

    expect(detailOf(result)).toBe(
      "3 notes landed outside the region and won't play",
    );
  });

  it("says 1 note, not 1 notes", async () => {
    setupSessionMocks({ liveSet: FOUR_FOUR, clip: ONE_BAR_CLIP });

    const result = await createClip({
      slot: "0/0",
      length: "1bar",
      notes: "C3 1|1 D3 1|6",
    });

    expect(detailOf(result)).toBe(
      "1 note landed outside the region and won't play",
    );
  });

  it("says nothing when every note starts inside", async () => {
    setupSessionMocks({ liveSet: FOUR_FOUR, clip: ONE_BAR_CLIP });

    const result = await createClip({
      slot: "0/0",
      length: "1bar",
      notes: "C3 1|1 D3 1|4.75",
    });

    expect(detailOf(result)).toBeUndefined();
  });

  it("counts the notes a transform pushes past the end", async () => {
    setupSessionMocks({ liveSet: FOUR_FOUR, clip: ONE_BAR_CLIP });

    const result = await createClip({
      slot: "0/0",
      length: "1bar",
      notes: "C3 D3 E3 1|1",
      transforms: "timing += 1bar",
    });

    expect(detailOf(result)).toBe(
      "3 notes landed outside the region and won't play",
    );
  });

  it("keeps the clip's entry when the region read throws after the notes landed", async () => {
    const { clip } = setupSessionMocks({
      liveSet: FOUR_FOUR,
      clip: ONE_BAR_CLIP,
    });
    const notesLanded = (): boolean =>
      clip.call.mock.calls.some(([method]) => method === "add_new_notes");

    clip.get.mockImplementation((prop: string) => {
      if (prop === "loop_end" && notesLanded()) {
        throw new Error("Live refused");
      }

      return [
        prop === "length"
          ? 4
          : ((ONE_BAR_CLIP as Record<string, number>)[prop] ?? 0),
      ];
    });

    const result = await createClip({
      slot: "0/0",
      length: "1bar",
      notes: "C3 1|1 D3 1|5",
    });

    expect(result).toStrictEqual({
      id: clip.id,
      path: "t0/s0",
      detail: "Live refused; already changed: clip created, properties, notes",
    });
  });
});
