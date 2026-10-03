// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  type LandedSpan,
  claimRemainders,
} from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { blankTargetIgnores } from "#src/tools/shared/validation/lists/target-lists.ts";
import {
  objectPathForApi,
  stillAtPath,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type Call,
  type Done,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { writtenOverBy } from "../arrangement/landing-log.ts";
import { clipIsGone } from "../arrangement/moved-source.ts";
import { type ClipRun } from "./clip-run.ts";
import { type ClipCall } from "./parse-clip-call.ts";
import { type ClipPayload } from "./resolve-clip-targets.ts";

type ClipDone = Done<ClipPayload, ClipCall, ClipResult>;

/** The whole-call args a blank value drops, in the order they are reported. */
const DROPPED_WHEN_BLANK = [
  "toPath",
  "toSlot",
  "arrangementStart",
  "arrangementLength",
  "arrangementSplit",
  "split",
] as const;

/**
 * Once every target has had its turn: say what a later write did to a clip
 * written earlier, name any entry the failure left without a path, say what the
 * call as a whole did nothing with, and focus the last clip written.
 * @param run - The call's shared state
 * @param done - What the call did
 * @param call - The call's shared state, for its warnings
 */
export function settleClipUpdate(
  run: ClipRun,
  done: ClipDone,
  call: Call,
): void {
  const { checked, targets, entries, pieces, outcomes } = done;

  reportOverwritten(run, done);
  reportClearedInPlace(run, done);

  for (const [index, entry] of entries.entries()) {
    if (outcomes[index] === "written") {
      for (const written of [entry, ...(pieces[index] as ClipResult[])]) {
        nameWhereItIs(written as ClipResult);
      }
    }
  }

  // A cut that every clip was measured against says what it cut nothing of.
  run.split?.finish(run.splitCount);

  // Said once the writes are done: they claim what the call did.
  for (const { param, why } of blankTargetIgnores(
    checked.sent,
    "clips",
    targets.filter(({ skip }) => skip == null).length,
  )) {
    call.ignored(param, why);
  }

  const blank = DROPPED_WHEN_BLANK.filter(
    (param) => checked.args[param]?.trim() === "",
  );

  if (blank.length > 0) {
    call.ignored(
      `blank ${blank.join(", ")}`,
      `leave ${blank.length === 1 ? "it" : "them"} out instead`,
    );
  }

  focusLastWritten(done, checked.args.focus === true);
}

// --- Helpers below main export ---

/**
 * Give an entry the failure left without a path the one it has now.
 * @param entry - A written entry
 */
function nameWhereItIs(entry: ClipResult): void {
  const { id, path } = entry as Partial<ClipResult>;

  if (path == null && id != null) {
    entry.path = objectPathForApi(LiveAPI.from(id));
  }
}

/**
 * Select the last clip the call wrote and show the clip detail view.
 * @param done - What the call did
 * @param focus - Whether the call asked for it
 */
function focusLastWritten(done: ClipDone, focus: boolean): void {
  if (!focus) {
    return;
  }

  // A skip names a target, not a clip, so there is nothing there to select.
  for (const index of done.entries.map((_, at) => at).toReversed()) {
    const last = [done.entries[index], ...(done.pieces[index] ?? [])]
      .toReversed()
      .find((entry) => (entry as Partial<ClipResult>).id != null) as
      | ClipResult
      | undefined;

    if (done.outcomes[index] === "written" && last != null) {
      focusSelect({ id: last.id, detailView: "clip" });

      return;
    }
  }
}

/**
 * A move left unwritten leaves its clip where it was, and a landing of another
 * target can still clear it there. Its entry then names nothing, and says which
 * write cleared the clip, not the one that took its move's place.
 * @param run - The call's shared state
 * @param done - What the call did
 */
function reportClearedInPlace(run: ClipRun, done: ClipDone): void {
  const { targets, entries, outcomes } = done;

  for (const [index, target] of targets.entries()) {
    if (
      target.skip != null ||
      outcomes[index] !== "superseded" ||
      !clipIsGone(target.data.clip) ||
      // Named again: the later mention is the one that speaks for the clip.
      targets.some(
        (later, at) =>
          at > index &&
          later.skip == null &&
          later.data.clip.id === target.data.clip.id,
      )
    ) {
      continue;
    }

    const by = writtenOverBy(
      target.data.span ?? undefined,
      run.landings.written,
    );
    const entry = entries[index] as Partial<ClipResult>;

    delete entry.id;
    entry.detail =
      by == null
        ? "overwritten later in this call"
        : `overwritten later in this call by ${by}`;
  }
}

/** One entry the call wrote, and the target that wrote it. */
interface WrittenEntry {
  index: number;
  entry: ClipResult;
}

/**
 * Account for every clip a later write of the same call cleared or cut. A clip
 * is checked by reading its id back, not by comparing the paths the call
 * reported: a clip can be cleared by one that starts somewhere else. Most
 * clashes are met before the write (and say so on the entry); this is the one
 * the call only found out about while writing.
 * @param run - The call's shared state
 * @param done - What the call did
 */
function reportOverwritten(run: ClipRun, done: ClipDone): void {
  const { targets, entries, pieces, outcomes } = done;
  const writes = targets.some(
    (target) =>
      target.skip == null &&
      (target.data.destination != null ||
        target.data.startBeats != null ||
        target.data.lengthBeats != null),
  );
  const written: WrittenEntry[] = entries.flatMap((entry, index) =>
    outcomes[index] === "written"
      ? [entry, ...(pieces[index] as ClipResult[])].map((each) => ({
          index,
          entry: each as ClipResult,
        }))
      : [],
  );

  // The read-back costs a look-up per entry, so most calls skip it: one that
  // clears nothing buries nothing, and a lone entry has no sibling.
  if (!writes || written.length < 2) {
    return;
  }

  const gone = written.filter(
    ({ entry }) =>
      (entry as Partial<ClipResult>).id != null &&
      entry.path != null &&
      !stillAtPath(entry.id, entry.path),
  );
  const goneEntries = new Set(gone.map(({ entry }) => entry));
  const sat = new Map<string, LandedSpan>();

  for (const target of targets) {
    if (target.skip == null && target.data.span != null) {
      sat.set(target.data.clip.id, target.data.span);
    }
  }

  const spanOf = (entry: ClipResult): LandedSpan | undefined =>
    run.landings.landed.get(entry.id) ?? sat.get(entry.id);
  // Gone from where it was doesn't mean gone: a later landing that takes only
  // part of it re-creates the rest under a new id.
  const remainders = claimRemainders({
    entries: gone.map(({ entry }) => entry),
    spanOf,
    written: run.landings.written,
    taken: written
      .filter(({ entry }) => !goneEntries.has(entry))
      .map(({ entry }) => entry.id),
    lanes: run.context.lanes,
  });

  for (const { index, entry } of gone) {
    const by = writtenOverBy(spanOf(entry), run.landings.written);
    const remainder = remainders.get(entry);

    if (remainder == null) {
      // It names nothing now.
      delete (entry as Partial<ClipResult>).id;
      appendDetail(
        entry,
        by == null
          ? "overwritten later in this call"
          : `overwritten later in this call by ${by}`,
      );
    } else {
      entry.id = remainder.clip.id;
      entry.path = remainder.path;
      entry.arrangementLength = lengthOf(remainder.clip);

      if (!done.shortened.has(index)) {
        appendDetail(
          entry,
          by == null
            ? "shortened later in this call"
            : `shortened by ${by} later in this call`,
        );
      }
    }
  }
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
