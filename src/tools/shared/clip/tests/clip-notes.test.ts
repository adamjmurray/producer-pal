// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  getClipNoteCount,
  rawNotesToCopiedNotes,
  rawNotesToNoteEvents,
  readAllClipNotes,
  readClipNotes,
  readVisibleClipNotesInSpan,
  removeAllClipNotes,
} from "#src/tools/shared/clip/clip-notes.ts";

const RAW_NOTE = {
  note_id: 7,
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
  mute: 1,
  release_velocity: 77,
};

const REGION_AT_ZERO = {
  length: 4,
  start_marker: 0,
  end_marker: 4,
  loop_start: 0,
  loop_end: 4,
};

function makeClip(
  callReturn: string,
  props: Record<string, number> = REGION_AT_ZERO,
): LiveAPI {
  return {
    getProperty: vi.fn((name: string) => props[name]),
    call: vi.fn(() => callReturn),
  } as unknown as LiveAPI;
}

describe("readVisibleClipNotesInSpan", () => {
  it("leaves muted notes out of the span it reads", () => {
    const clip = makeClip(
      JSON.stringify({
        notes: [
          { pitch: 60, mute: 0 },
          { pitch: 61, mute: 1 },
        ],
      }),
    );

    expect(readVisibleClipNotesInSpan(clip, -10, 20)).toStrictEqual([
      { pitch: 60, mute: 0 },
    ]);
    expect(clip.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      -10,
      20,
    );
  });
});

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

  it("doesn't count muted notes", () => {
    const clip = makeClip(
      JSON.stringify({ notes: [{ mute: 0 }, { mute: 1 }, {}] }),
    );

    expect(getClipNoteCount(clip)).toBe(2);
  });

  it("reads the same window as read-clip (counts pickups/overhang)", () => {
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
  it("returns the raw notes across read-clip's window", () => {
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

describe("readClipNotes", () => {
  it("splits notes into visible and muted, keeping each note as read", () => {
    const visible = { ...RAW_NOTE, mute: 0 };
    const noFlag = { pitch: 62 };
    const clip = makeClip(
      JSON.stringify({ notes: [visible, RAW_NOTE, noFlag] }),
    );

    expect(readClipNotes(clip)).toStrictEqual({
      visible: [visible, noFlag],
      muted: [RAW_NOTE],
    });
  });

  it("returns both empty for a clip without notes", () => {
    expect(readClipNotes(makeClip(JSON.stringify({})))).toStrictEqual({
      visible: [],
      muted: [],
    });
  });
});

describe("clip note scan window", () => {
  it("follows a region that doesn't start at beat 0", () => {
    // A clip created at 5|1: its notes sit at beat 16, far outside [-4, 8].
    const clip = makeClip(JSON.stringify({ notes: [{}] }), {
      length: 4,
      start_marker: 16,
      end_marker: 20,
      loop_start: 16,
      loop_end: 20,
    });

    readAllClipNotes(clip);
    removeAllClipNotes(clip);

    expect(clip.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      12,
      12,
    );
    expect(clip.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      12,
      12,
    );
  });

  it("covers both the markers and the loop when they differ", () => {
    // Start marker before the loop, end marker past it: [0, 16] plus a
    // loop-length (4) of margin on each side.
    const clip = makeClip("null", {
      length: 4,
      start_marker: 0,
      end_marker: 16,
      loop_start: 8,
      loop_end: 12,
    });

    readAllClipNotes(clip);

    expect(clip.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      -4,
      24,
    );
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

describe("rawNotesToNoteEvents", () => {
  it("drops note_id, mute and release_velocity", () => {
    expect(rawNotesToNoteEvents([RAW_NOTE])).toStrictEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      },
    ]);
  });
});

describe("rawNotesToCopiedNotes", () => {
  it("keeps mute and release_velocity, and drops only note_id", () => {
    // note_id still goes: a stale id re-fed on a later write lands on the note
    // it was read from.
    const [copied] = rawNotesToCopiedNotes([RAW_NOTE]);

    expect(copied).toStrictEqual({
      pitch: 60,
      start_time: 0,
      duration: 1,
      velocity: 100,
      probability: 1,
      velocity_deviation: 0,
      mute: 1,
      release_velocity: 77,
    });
  });
});
