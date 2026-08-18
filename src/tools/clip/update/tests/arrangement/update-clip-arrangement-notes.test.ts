// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { requireMockObject } from "#src/test/helpers/mock-registry-test-helpers.ts";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  mockContext,
  setupArrangementClipPath,
  setupArrangementMidiClipMock,
  setupMockProperties,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

// A call that writes notes AND sets arrangementLength must still report
// noteCount — the length helpers return ids only, so the note stats have to be
// merged onto the clip the notes went to, and counted after the length change.

const MIDI_CLIP_PROPS = {
  start_time: 0.0,
  end_time: 4.0,
  start_marker: 0.0,
  end_marker: 4.0,
  loop_start: 0.0,
  loop_end: 4.0,
  length: 4.0,
  trackIndex: 0,
};

describe("updateClip - note stats alongside arrangementLength", () => {
  let clip: RegisteredMockObject;

  beforeEach(() => {
    const clips = setupArrangementClipPath(0, ["789", "1000", "1001"]);
    const sourceClip = clips.get("789");

    if (sourceClip == null) {
      throw new Error("Expected arrangement clip mock for 789");
    }

    clip = sourceClip;
    setupMockProperties(requireMockObject("live_set"), {
      signature_numerator: 4,
      signature_denominator: 4,
    });
    setupMockProperties(requireMockObject(livePath.track(0)), {
      arrangement_clips: ["id", 789],
    });
  });

  it("reports noteCount when lengthening an unlooped clip in the same call", async () => {
    setupArrangementMidiClipMock(clip, { ...MIDI_CLIP_PROPS, looping: 0 });

    const result = await updateClip(
      { ids: "789", notes: "C3 1|1 E3 2|1", arrangementLength: "2bar" },
      mockContext,
    );

    expect(result).toStrictEqual({ id: "789", noteCount: 2 });
  });

  it("counts the notes past the old end, not just the ones that already fit", async () => {
    setupArrangementMidiClipMock(clip, { ...MIDI_CLIP_PROPS, looping: 0 });
    trackNotesInScanWindow(clip);

    const result = await updateClip(
      { ids: "789", notes: "C3 1|1 D3 2|1 E3 3|1", arrangementLength: "3bar" },
      mockContext,
    );

    // The clip is still 1 bar when the notes are written, so the first count's
    // [-length, 2*length] window stops at beat 8 and misses E3. Lengthening
    // widens the window, and the recount picks all three up.
    expect(result).toStrictEqual({ id: "789", noteCount: 3 });
  });

  it("puts noteCount on the source clip and leaves the tiles bare", async () => {
    setupArrangementMidiClipMock(clip, { ...MIDI_CLIP_PROPS, looping: 1 });

    const result = await updateClip(
      { ids: "789", notes: "C3 1|1", arrangementLength: "3bar" },
      mockContext,
    );

    // Notes were written to 789, so only it carries the count; the tiles are
    // copies of it.
    expect(result).toStrictEqual([
      { id: "789", noteCount: 1 },
      { id: "1000" },
      { id: "1001" },
    ]);
  });
});

interface TrackedNote {
  start_time: number;
}

/**
 * Make a clip mock behave like a real one for note reads: get_notes_extended
 * returns only the notes inside the window it was asked for, and the clip's
 * `length` follows loop_end so lengthening widens that window. The shared
 * helper ignores the window, which would hide the pre-length count entirely.
 * @param clip - Registered mock clip to rewire
 */
function trackNotesInScanWindow(clip: RegisteredMockObject): void {
  const written: TrackedNote[] = [];
  let lengthBeats = MIDI_CLIP_PROPS.length;
  const staticGet = clip.get.getMockImplementation();

  clip.get.mockImplementation((prop: string) =>
    prop === "length" ? [lengthBeats] : staticGet?.(prop),
  );
  clip.set.mockImplementation((prop: string, value: number) => {
    if (prop === "loop_end") {
      lengthBeats = value - MIDI_CLIP_PROPS.loop_start;
    }
  });
  clip.call.mockImplementation((method: string, ...args: unknown[]) => {
    if (method === "add_new_notes") {
      written.push(...(args[0] as { notes: TrackedNote[] }).notes);

      return {};
    }

    if (method === "get_notes_extended") {
      const [, , fromTime, timeSpan] = args as number[];

      return JSON.stringify({
        notes: notesWithin(written, fromTime, timeSpan),
      });
    }

    return {};
  });
}

/**
 * The notes inside a get_notes_extended time window.
 * @param notes - Every note written to the clip
 * @param fromTime - Window start in beats
 * @param timeSpan - Window length in beats
 * @returns The notes the window covers
 */
function notesWithin(
  notes: TrackedNote[],
  fromTime = 0,
  timeSpan = 0,
): TrackedNote[] {
  return notes.filter(
    (note) =>
      note.start_time >= fromTime && note.start_time < fromTime + timeSpan,
  );
}
