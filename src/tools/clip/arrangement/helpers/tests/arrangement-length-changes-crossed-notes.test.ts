// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  clearMockRegistry,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { newClipReasons } from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import {
  setupClip,
  setupMidiSourceClip,
  setupTileClip,
  setupTrackWithQueuedMethods,
} from "#src/tools/shared/arrangement/tests/helpers/arrangement-tiling-test-helpers.ts";
import { handleArrangementLengthening } from "../arrangement-length-changes.ts";

interface TestNote {
  start_time: number;
  duration: number;
  mute?: number;
}

interface LengthenOpts {
  /** Loop region; the default is 0 to 8. */
  loop?: [number, number];
  /** Where the clip starts playing; the default is the loop start. */
  startMarker?: number;
  /** How long the clip is shown now, in beats. */
  shown: number;
  /** How long it is after the call truncates it, if it does. */
  shownAfterCut?: number;
  /** The length asked for, in beats. */
  target: number;
  isAudioClip?: boolean;
  /** Live refuses the first copy, leaving a hole. */
  refuseFirstCopy?: boolean;
  /** Make the note read throw. */
  unreadable?: boolean;
}

/**
 * Lengthen a looped clip with the real tiling code against the mock Live.
 * @param notes - The notes the clip holds
 * @param opts - The clip and the length asked for
 * @returns What the entry says about crossed notes, and the note reads made
 */
function lengthen(
  notes: TestNote[],
  opts: LengthenOpts,
): { said: string[]; reads: number } {
  const [loopStart, loopEnd] = opts.loop ?? [0, 8];

  clearMockRegistry();

  const clip = setupMidiSourceClip("100", 0, {
    is_arrangement_clip: 1,
    looping: 1,
    loop_start: loopStart,
    loop_end: loopEnd,
    start_marker: opts.startMarker ?? loopStart,
    end_marker: loopEnd,
    start_time: 0,
    end_time: opts.shownAfterCut ?? opts.shown,
  });
  const clipMock = lookupMockObject("100");

  clipMock?.call.mockImplementation((method: string) => {
    if (method !== "get_notes_extended") {
      return undefined;
    }

    if (opts.unreadable) {
      throw new Error("Live refused the note read");
    }

    return JSON.stringify({
      notes: notes.map((n) => ({ pitch: 36, mute: 0, ...n })),
    });
  });

  const ids = Array.from({ length: 12 }, (_, i) => String(200 + i));

  for (const id of ids) {
    // A tile keeps the marker tiling gives it, so the pre-roll fix is a no-op.
    setupTileClip(id, { start_marker: loopEnd, loop_start: loopStart });
  }

  setupClip("300", {});
  setupTrackWithQueuedMethods(0, {
    duplicate_clip_to_arrangement: ids.map((id, i) => [
      "id",
      opts.refuseFirstCopy && i === 0 ? "0" : id,
    ]),
    create_midi_clip: Array.from({ length: 4 }, () => ["id", "300"]),
    delete_clip: Array.from({ length: 4 }, () => null),
  });

  const reasons = newClipReasons();

  handleArrangementLengthening({
    clip,
    isAudioClip: opts.isAudioClip ?? false,
    arrangementLengthBeats: opts.target,
    currentArrangementLength: opts.shown,
    currentStartTime: 0,
    currentEndTime: opts.shown,
    context: { silenceWavPath: "/tmp/silence.wav" },
    reasons,
  });

  return {
    said: [...reasons.said.values()]
      .flat()
      .filter((reason) => /crossed/.test(reason)),
    reads:
      clipMock?.call.mock.calls.filter(
        (c: unknown[]) => c[0] === "get_notes_extended",
      ).length ?? 0,
  };
}

const ONE = ["1 note crossed a cut and now ends at it"];

// An 8-beat loop shown for 4 beats, lengthened to 16: pieces play content
// 0-4, 4-8, 0-4 and 4-8, so they stop at 4, 8 (the loop end) and 4.
const FOUR_OF_EIGHT: LengthenOpts = { shown: 4, target: 16 };

describe("handleArrangementLengthening with a note across a tile boundary", () => {
  it("says a note that crosses a mid-loop boundary now ends there", () => {
    const { said } = lengthen([{ start_time: 2, duration: 4 }], FOUR_OF_EIGHT);

    // Crossed at content 4 twice, counted once.
    expect(said).toStrictEqual(ONE);
  });

  it("counts every note that crosses a boundary", () => {
    const { said } = lengthen(
      [
        { start_time: 2, duration: 4 },
        { start_time: 3, duration: 2 },
        { start_time: 0, duration: 1 },
      ],
      FOUR_OF_EIGHT,
    );

    expect(said).toStrictEqual(["2 notes crossed a cut and now end at it"]);
  });

  it("ignores a note that ends at a boundary or starts on one", () => {
    const { said } = lengthen(
      [
        { start_time: 2, duration: 2 },
        { start_time: 4, duration: 2 },
      ],
      FOUR_OF_EIGHT,
    );

    expect(said).toStrictEqual([]);
  });

  it("ignores a note running past the loop end when a piece stops there", () => {
    // Shown for the whole loop, so the only boundary is the loop end: Live ends
    // the note there anyway.
    const { said } = lengthen([{ start_time: 6, duration: 4 }], {
      shown: 8,
      target: 16,
    });

    expect(said).toStrictEqual([]);
  });

  it("wraps a stop in the next pass, leaving out a note that ended at the loop end", () => {
    // Plays from 2 for a pass, so it stops at 2 of the second pass. The note
    // from 6 to 11 ends at the loop end (8); if the stop weren't wrapped it
    // would read as 10 and count it. The note from 1 to 4 is sounding at 2.
    const opts: LengthenOpts = { startMarker: 2, shown: 8, target: 16 };

    expect(lengthen([{ start_time: 6, duration: 5 }], opts).said).toStrictEqual(
      [],
    );
    expect(lengthen([{ start_time: 1, duration: 3 }], opts).said).toStrictEqual(
      ONE,
    );
  });

  it("ignores muted notes", () => {
    const { said } = lengthen(
      [{ start_time: 2, duration: 4, mute: 1 }],
      FOUR_OF_EIGHT,
    );

    expect(said).toStrictEqual([]);
  });

  it("skips a note that starts before the start marker and never plays", () => {
    // Plays from 2 for 4 beats, so it stops at 6: the note from 1 to 7 starts
    // earlier and never plays. The one from 2.5 is cut there.
    const { said } = lengthen(
      [
        { start_time: 1, duration: 6 },
        { start_time: 2.5, duration: 4 },
      ],
      { startMarker: 2, shown: 4, target: 8 },
    );

    expect(said).toStrictEqual(ONE);
  });

  // The clip starts inside the loop and is longer than one pass, so it is cut
  // back to one pass and tiled from the loop start: the tiles don't pick up
  // where the clip's phase would be.
  it("follows the tiles when a start marker inside the loop makes them start at the loop start", () => {
    // Plays 2 to 8, then 0 to 2: stops at 2. The tiles play 0 to 8 and stop at
    // the loop end.
    const crossing = lengthen([{ start_time: 1, duration: 3 }], {
      startMarker: 2,
      shown: 10,
      shownAfterCut: 8,
      target: 24,
    });
    const elsewhere = lengthen([{ start_time: 4, duration: 3 }], {
      startMarker: 2,
      shown: 10,
      shownAfterCut: 8,
      target: 24,
    });

    expect(crossing.said).toStrictEqual(ONE);
    expect(elsewhere.said).toStrictEqual([]);
  });

  it("follows the tiles when the clip has pre-roll", () => {
    // Loop 2-10, playing from 0: the clip plays 0 to 4 and stops at 4, the
    // tiles play 4-8 and 8-12 (which wraps to 4) and stop at 8.
    const loop: LengthenOpts = {
      loop: [2, 10],
      startMarker: 0,
      shown: 4,
      target: 12,
    };

    expect(lengthen([{ start_time: 3, duration: 2 }], loop).said).toStrictEqual(
      ONE,
    );
    expect(lengthen([{ start_time: 6, duration: 3 }], loop).said).toStrictEqual(
      ONE,
    );
  });

  it("leaves a pickup out of the later passes", () => {
    // Loop 2-10, playing from 0, shown for 6: the clip stops at 6, the next tile
    // plays 6-10 and 2-4 and stops at 4 of the second pass, where the pickup
    // (before the loop) no longer plays. The pickup from 0 to 4.5 reaches past
    // that stop but ends before the first one; the note from 3 to 5 is cut at it.
    const opts: LengthenOpts = {
      loop: [2, 10],
      startMarker: 0,
      shown: 6,
      target: 18,
    };

    expect(
      lengthen([{ start_time: 0, duration: 4.5 }], opts).said,
    ).toStrictEqual([]);
    expect(lengthen([{ start_time: 3, duration: 2 }], opts).said).toStrictEqual(
      ONE,
    );
  });

  it("counts the boundary before a partial last tile", () => {
    const { said } = lengthen([{ start_time: 2, duration: 4 }], {
      shown: 4,
      target: 6,
    });

    expect(said).toStrictEqual(ONE);
  });

  it("skips the boundaries next to a tile Live refused", () => {
    // The clip stops at 2 and the next tile is missing, so that is a gap, not a
    // cut. The tiles after it still run into each other.
    const opts: LengthenOpts = { shown: 2, target: 8 };
    const notes = [{ start_time: 1, duration: 2 }];

    expect(lengthen(notes, opts).said).toStrictEqual(ONE);
    expect(
      lengthen(notes, { ...opts, refuseFirstCopy: true }).said,
    ).toStrictEqual([]);
  });

  it("says nothing for an audio clip, and reads no notes", () => {
    const { said, reads } = lengthen([{ start_time: 2, duration: 4 }], {
      ...FOUR_OF_EIGHT,
      isAudioClip: true,
    });

    expect(said).toStrictEqual([]);
    expect(reads).toBe(0);
  });

  it("says nothing for a clip without notes", () => {
    expect(lengthen([], FOUR_OF_EIGHT).said).toStrictEqual([]);
  });

  it("still lengthens when the notes can't be read", () => {
    const { said } = lengthen([{ start_time: 2, duration: 4 }], {
      ...FOUR_OF_EIGHT,
      unreadable: true,
    });

    expect(said).toStrictEqual([]);
  });
});
