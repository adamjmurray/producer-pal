// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A cut ends a note that crosses it: the note stays in the earlier piece, and
// the later pieces start after its start, so nothing plays the rest. Nothing
// in the pieces shows that, so the clip's entry has to.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { readClipNotes } from "#src/tools/shared/clip/clip-notes.ts";
import { type ClipReporter } from "#src/tools/shared/arrangement/helpers/clip-reporter.ts";

interface PlayedClip {
  looping: boolean;
  startMarker: number;
  loopStart: number;
  loopEnd: number;
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
  try {
    const played: PlayedClip = {
      looping: (clip.getProperty("looping") as number) > 0,
      startMarker: clip.getProperty("start_marker") as number,
      loopStart: clip.getProperty("loop_start") as number,
      loopEnd: clip.getProperty("loop_end") as number,
    };

    return crossingNotes(
      readClipNotes(clip).visible as unknown as PlayedNote[],
      played,
      offsets,
    );
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
 * @param clip - Where the clip plays from
 * @param offsets - The cuts, as beats from the clip's start
 * @returns Per crossing note, the index of its first cut
 */
function crossingNotes(
  notes: PlayedNote[],
  clip: PlayedClip,
  offsets: number[],
): number[] {
  const crossed = new Set<PlayedNote>();
  const firstCuts: number[] = [];

  for (const [cut, offset] of offsets.entries()) {
    const { at, from, until } = contentPosition(clip, offset);

    for (const note of notes) {
      const end = Math.min(note.start_time + note.duration, until);

      if (
        !crossed.has(note) &&
        note.start_time >= from - SAME_TIME_EPSILON &&
        note.start_time < at - SAME_TIME_EPSILON &&
        end > at + SAME_TIME_EPSILON
      ) {
        crossed.add(note);
        firstCuts.push(cut);
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
 * @returns The cut's note time, the earliest note start that plays up to it,
 *   and where a note stops playing in that pass
 */
function contentPosition(
  clip: PlayedClip,
  offset: number,
): { at: number; from: number; until: number } {
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
