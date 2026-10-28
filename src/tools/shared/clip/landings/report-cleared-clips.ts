// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A clip another write of the same call landed across no longer sits where its
// entry put it. This finds out what became of it, so no entry names a clip that
// is gone. Most clashes are met before the write (and say so on the entry);
// this is the one the call only learns of while writing.

import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { stillAtPath } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import {
  type LandedSpan,
  claimRemainders,
} from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
import { type LandingLog, writtenOverBy, wroteOver } from "./landing-log.ts";

/** What the read-back needs of an entry, and what it may change on it. */
export interface ClearedClipEntry {
  id?: string;
  path?: string;
  detail?: string;
  arrangementLength?: string;
}

/** An arrangement entry the call wrote. */
export interface WrittenClip<E> {
  entry: E;
  /** The entry already says a later write cut it short */
  said: boolean;
}

/** What {@link reportClearedClips} reads. */
export interface ClearedClipsRead<E> {
  written: Array<WrittenClip<E>>;
  /** Where an entry's clip sat when the call wrote it */
  spanOf: (entry: E) => LandedSpan | undefined;
  log: LandingLog;
  lanes?: LaneView;
}

/**
 * Account for every written clip a later write of the same call cleared or cut.
 * A clip is checked by reading its id back, not by comparing the paths the call
 * reported: a clip can be cleared by one that starts somewhere else. An entry
 * whose clip is gone loses its id and says who wrote over it; one that Live cut
 * short names what is left, under the id Live gave it.
 * @param read - The entries, where each sat, and what the call has written
 */
export function reportClearedClips<E extends ClearedClipEntry>(
  read: ClearedClipsRead<E>,
): void {
  const { written, log } = read;

  // The read-back costs a look-up per entry, and a lone entry has no sibling.
  if (written.length < 2) {
    return;
  }

  const gone = written.filter(
    ({ entry }) =>
      entry.id != null &&
      entry.path != null &&
      !stillAtPath(entry.id, entry.path),
  );
  const goneEntries = new Set(gone.map(({ entry }) => entry));
  // Gone from where it was doesn't mean gone: a later landing that takes only
  // part of it re-creates the rest under a new id.
  const remainders = claimRemainders({
    entries: gone.map(({ entry }) => entry),
    spanOf: read.spanOf,
    written: log.written,
    taken: written
      .filter(({ entry }) => !goneEntries.has(entry))
      // Every entry handed in names a clip until this has run.
      .map(({ entry }) => entry.id as string),
    lanes: read.lanes,
  });

  for (const { entry, said } of gone) {
    const by = writtenOverBy(read.spanOf(entry), othersWrites(entry, log));
    const remainder = remainders.get(entry);

    if (remainder == null) {
      // It names nothing now.
      delete entry.id;
      appendDetail(
        entry,
        by == null
          ? "overwritten later in this call"
          : `overwritten later in this call by ${by}`,
      );
      continue;
    }

    entry.id = remainder.clip.id;
    entry.path = remainder.path;
    entry.arrangementLength = lengthOf(remainder.clip);

    if (!said) {
      appendDetail(
        entry,
        by == null
          ? "shortened later in this call"
          : `shortened by ${by} later in this call`,
      );
    }
  }

  for (const { entry, said } of written) {
    if (!said && !goneEntries.has(entry)) {
      noteCutShort(entry, read);
    }
  }
}

// --- Helpers below main export ---

/**
 * Say so on an entry whose clip is still where it was put but ends sooner: a
 * later write cut its tail off, or split it and left it the head. Which of the
 * two isn't said; the entry's length is what is left.
 * @param entry - An entry whose clip still sits at its path
 * @param read - What the call has written
 */
function noteCutShort<E extends ClearedClipEntry>(
  entry: E,
  read: ClearedClipsRead<E>,
): void {
  const span = read.spanOf(entry);

  if (span == null || entry.id == null) {
    return;
  }

  const clip = LiveAPI.from(entry.id);
  const end = clip.getProperty("end_time");

  if (typeof end !== "number" || end >= span.end - SAME_TIME_EPSILON) {
    return;
  }

  // A clip can end sooner than its entry's span with no later write to blame:
  // lengthening tiles cut the first one to a whole loop.
  const written = othersWrites(entry, read.log);

  if (!wroteOver(span, written)) {
    return;
  }

  const by = writtenOverBy(span, written);

  entry.arrangementLength = lengthOf(clip);
  appendDetail(
    entry,
    by == null
      ? "shortened later in this call"
      : `shortened by ${by} later in this call`,
  );
}

/**
 * What the call wrote that could have cut an entry's clip: not its own resize,
 * which shortens it on purpose.
 * @param entry - The entry whose clip is in question
 * @param log - What the call has written
 * @returns The spans written
 */
function othersWrites(entry: ClearedClipEntry, log: LandingLog): LandedSpan[] {
  return log.written.filter(
    ({ resizes }) => resizes == null || resizes !== entry.id,
  );
}

/**
 * How much of the arrangement a clip covers, as read-clip reports it.
 * @param clip - The clip to measure
 * @returns Its span as a duration
 */
function lengthOf(clip: LiveAPI): string {
  const start = clip.getProperty("start_time") as number;
  const end = clip.getProperty("end_time") as number;
  const { numerator, denominator } = songMeter();

  return abletonBeatsToDuration(end - start, numerator, denominator);
}
