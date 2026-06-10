// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  getClipNoteCount,
  readAllClipNotes,
  removeAllClipNotes,
} from "#src/tools/shared/clip-notes.ts";

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

describe("readAllClipNotes", () => {
  it("returns the raw notes across read-clip's [-length, 2*length] window", () => {
    const raw = [
      { pitch: 60, start_time: -1, duration: 1 }, // a pickup before the start
      { pitch: 62, start_time: 0, duration: 1 },
    ];
    const clip = makeClip(JSON.stringify({ notes: raw }));

    // Returned unmodified (note_id/mute still attached — caller strips them).
    expect(readAllClipNotes(clip)).toStrictEqual(raw);
    // length=4 → window from -4 spanning 12 beats ([-4, 8)), so the pickup is
    // included instead of being dropped outside the playable region [0, 4].
    expect(clip.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      -4,
      12,
    );
  });

  it("returns [] when the window holds no notes or the result is null", () => {
    expect(
      readAllClipNotes(makeClip(JSON.stringify({ notes: [] }))),
    ).toStrictEqual([]);
    expect(readAllClipNotes(makeClip(JSON.stringify({})))).toStrictEqual([]);
    expect(readAllClipNotes(makeClip("null"))).toStrictEqual([]);
  });
});

describe("removeAllClipNotes", () => {
  it("removes notes across the same window readAllClipNotes reads", () => {
    const clip = makeClip("null");

    removeAllClipNotes(clip);

    // MUST mirror readAllClipNotes' window: a wider remove would delete a far
    // pickup/overhang that was never read back and re-added.
    expect(clip.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      -4,
      12,
    );
  });
});
