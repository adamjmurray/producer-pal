// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { getClipNoteCount } from "#src/tools/shared/clip-notes.ts";

function makeClip(callReturn: string): LiveAPI {
  return {
    getProperty: vi.fn(() => 4),
    call: vi.fn(() => callReturn),
  } as unknown as LiveAPI;
}

describe("getClipNoteCount", () => {
  it("returns the note count when notes are present", () => {
    const clip = makeClip(JSON.stringify({ notes: [{}, {}, {}] }));

    expect(getClipNoteCount(clip)).toBe(3);
  });

  it("returns 0 when notes array is empty", () => {
    const clip = makeClip(JSON.stringify({ notes: [] }));

    expect(getClipNoteCount(clip)).toBe(0);
  });

  it("returns 0 when the result has no notes key", () => {
    const clip = makeClip(JSON.stringify({}));

    expect(getClipNoteCount(clip)).toBe(0);
  });

  it("returns 0 when the parsed result is null", () => {
    const clip = makeClip("null");

    expect(getClipNoteCount(clip)).toBe(0);
  });

  it("reads the same [-length, 2*length] window as read-clip (counts pickups/overhang)", () => {
    // length=4, so the window must be from -4 spanning 12 beats ([-4, 8]),
    // matching read-clip — not the old playable-only [0, 4]. This is what makes
    // create/update noteCount agree with read-clip for out-of-bounds notes.
    const clip = makeClip(JSON.stringify({ notes: [{}, {}] }));

    expect(getClipNoteCount(clip)).toBe(2);
    expect(clip.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      -4,
      12,
    );
  });
});
