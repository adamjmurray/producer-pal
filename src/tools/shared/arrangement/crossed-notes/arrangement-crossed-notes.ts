// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A cut ends a note that crosses it: the note stays in the earlier piece, and
// the later pieces start after its start, so nothing plays the rest. Lengthening
// a looped clip does the same where one tile stops and the next begins. Nothing
// in the pieces shows that, so the clip's entry has to.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { readClipNotes } from "#src/tools/shared/clip/clip-notes.ts";
import { type ClipReporter } from "#src/tools/shared/arrangement/helpers/clip-reporter.ts";
import { type TilePiece } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";

interface PlayedClip {
  looping: boolean;
  startMarker: number;
  loopStart: number;
  loopEnd: number;
}

/** Where a cut falls in the clip's notes. */
interface Cut {
  /** The cut's note time. */
  at: number;
  /** The earliest note start that plays up to it. */
  from: number;
  /** Where a note stops playing in that pass. */
  until: number;
}

interface PlayedNote {
  start_time: number;
  duration: number;
}

/**
 * For each note that crosses a cut, the first cut it crosses. Read before the
 * clip is cut, since the pieces no longer hold the original notes. A clip whose
 * notes can't be read reports none: the cut itself is unaffected.
 * @param clip - The MIDI arrangement clip about to be cut
 * @param offsets - The cuts, as beats from the clip's start, ascending
 * @returns Per crossing note, the index in `offsets` of its first cut
 */
export function firstCutsCrossed(clip: LiveAPI, offsets: number[]): number[] {
  return crossedBy(clip, (played) =>
    offsets.map((offset) => contentPosition(played, offset)),
  );
}

/**
 * Say how many notes the tile boundaries of a lengthened looped clip ended.
 * Wherever a piece stops, a note still sounding there is cut off, whatever the
 * next piece plays. Counts a note once, however many boundaries it crosses.
 * Boundaries next to a gap are skipped: a missing tile is silence, not a cut.
 * Says nothing if the clip can't be read: the count is only a diagnostic.
 * @param report - Where to say what happened to the clip, if anywhere
 * @param clip - The MIDI clip that was lengthened, as it is now
 * @param tiles - What tiling placed after it, in order, as it wrote them
 */
export function reportTileCrossedNotes(
  report: ClipReporter | undefined,
  clip: LiveAPI,
  tiles: TilePiece[],
): void {
  if (report == null || tiles.length === 0) {
    return;
  }

  const cuts = crossedBy(clip, (played) => {
    const start = clip.getProperty("start_time") as number;
    const first: TilePiece = {
      start,
      length: (clip.getProperty("end_time") as number) - start,
      startMarker: played.startMarker,
    };
    const pieces = [first, ...tiles.toSorted((a, b) => a.start - b.start)];

    // A piece's stop is a cut only when the next piece starts right there.
    return pieces.flatMap((piece, i) => {
      const next = pieces[i + 1];

      return next != null &&
        Math.abs(piece.start + piece.length - next.start) <= SAME_TIME_EPSILON
        ? [
            contentPosition(
              { ...played, startMarker: piece.startMarker },
              piece.length,
            ),
          ]
        : [];
    });
  });

  // Every boundary is of pieces that landed.
  reportCrossedNotes(report, clip.id, cuts, Infinity);
}

/**
 * @param clip - The MIDI clip whose notes are checked
 * @param cuts - Where the cuts fall, given how the clip plays; not called for
 *   a clip without notes. Ascending for the first-cut indexes to mean anything.
 * @returns Per crossing note, the index in the cuts of its first cut
 */
function crossedBy(
  clip: LiveAPI,
  cuts: (played: PlayedClip) => Cut[],
): number[] {
  try {
    const played: PlayedClip = {
      looping: (clip.getProperty("looping") as number) > 0,
      startMarker: clip.getProperty("start_marker") as number,
      loopStart: clip.getProperty("loop_start") as number,
      loopEnd: clip.getProperty("loop_end") as number,
    };
    const notes = readClipNotes(clip).visible as unknown as PlayedNote[];

    return notes.length === 0 ? [] : crossingNotes(notes, cuts(played));
  } catch {
    return [];
  }
}

/**
 * Say how many notes a cut ended, on the clip's entry.
 * @param report - Where to say what happened to the clip, if anywhere
 * @param clipId - The clip, by the id the call found it at
 * @param firstCuts - From {@link firstCutsCrossed}
 * @param cutsMade - How many of the cuts landed, counting from the first
 */
export function reportCrossedNotes(
  report: ClipReporter | undefined,
  clipId: string,
  firstCuts: number[],
  cutsMade: number,
): void {
  const count = firstCuts.filter((cut) => cut < cutsMade).length;

  if (count > 0) {
    report?.note(
      clipId,
      count === 1
        ? "1 note crossed a cut and now ends at it"
        : `${count} notes crossed a cut and now end at it`,
    );
  }
}

/**
 * @param notes - The clip's visible notes
 * @param cuts - Where the cuts fall
 * @returns Per crossing note, the index of its first cut
 */
function crossingNotes(notes: PlayedNote[], cuts: Cut[]): number[] {
  const crossed = new Set<PlayedNote>();
  const firstCuts: number[] = [];

  for (const [index, { at, from, until }] of cuts.entries()) {
    for (const note of notes) {
      const end = Math.min(note.start_time + note.duration, until);

      if (
        !crossed.has(note) &&
        note.start_time >= from - SAME_TIME_EPSILON &&
        note.start_time < at - SAME_TIME_EPSILON &&
        end > at + SAME_TIME_EPSILON
      ) {
        crossed.add(note);
        firstCuts.push(index);
      }
    }
  }

  return firstCuts;
}

/**
 * Where in the clip's notes a cut falls. A looping clip plays from its start
 * marker to the loop end once, then repeats the loop; a cut in a later pass
 * only crosses notes of that pass (the pickup before the loop plays once).
 * @param clip - Where the clip plays from
 * @param offset - Beats from the clip's start
 * @returns Where the cut falls in the clip's notes
 */
function contentPosition(clip: PlayedClip, offset: number): Cut {
  const loopLength = clip.loopEnd - clip.loopStart;
  const first = clip.startMarker + offset;

  if (!clip.looping || loopLength <= 0) {
    return { at: first, from: clip.startMarker, until: Infinity };
  }

  if (first < clip.loopEnd - SAME_TIME_EPSILON) {
    return { at: first, from: clip.startMarker, until: clip.loopEnd };
  }

  // The tolerance keeps a position just under a pass boundary from landing at
  // the end of the previous pass instead of the start of the next.
  const into = Math.max(first - clip.loopEnd, 0);
  const passes = Math.floor((into + SAME_TIME_EPSILON) / loopLength);

  return {
    at: clip.loopStart + Math.max(into - passes * loopLength, 0),
    from: clip.loopStart,
    until: clip.loopEnd,
  };
}
