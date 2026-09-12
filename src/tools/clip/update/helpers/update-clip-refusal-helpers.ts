// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import {
  paramNamesSomething,
  parseTimeSignature,
} from "#src/tools/shared/utils.ts";
import {
  refuseDoubledPosition,
  requireClipDestinationPath,
} from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import {
  pathEntries,
  pathNamesSomething,
} from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";

/**
 * Refuses a call there is no reading of, before any clip is touched: a
 * whole-call param with no valid value, one position spelled two ways, or one
 * toPath that names a lane or slot for more than one clip.
 * @param timeSignature - Whole-call meter, if sent
 * @param quantizePitch - Whole-call quantize pitch, if sent
 * @param toPath - Destination path(s), if sent
 * @param arrangementStart - Deprecated destination position(s), if sent
 * @param targetCount - How many ids the call named
 */
export function refuseUnreadableCall(
  timeSignature: string | undefined,
  quantizePitch: string | undefined,
  toPath: string | undefined,
  arrangementStart: string | undefined,
  targetCount: number,
): void {
  validateWholeCallParams(timeSignature, quantizePitch);
  refuseDoubledPosition(toPath, arrangementStart, "toPath");
  refuseSharedClipDestination(toPath, targetCount);
}

/**
 * Refuse a single toPath that names a lane or slot (`t0`, `t0/l0`, `t0/s1`,
 * `t0[5|1]`) for more than one clip. One place holds one object, so it has to
 * be named once per target; a bare `[5|1]` is fine; it leaves each clip on its
 * own lane and only sets where on it they land.
 * @param toPath - Destination path(s), if sent
 * @param targetCount - How many ids the call named
 */
function refuseSharedClipDestination(
  toPath: string | undefined,
  targetCount: number,
): void {
  if (!paramNamesSomething(toPath) || targetCount <= 1) {
    return;
  }

  const entries = pathEntries(toPath, "toPath");

  if (entries.length !== 1) {
    return;
  }

  let destination;

  try {
    destination = requireClipDestinationPath(
      parseObjectPath(entries[0] as string, "toPath"),
      "toPath",
    );
  } catch {
    // Not this function's job: the entry gets its own warning where toPath is
    // actually resolved, once the call runs.
    return;
  }

  if (destination.lane == null) {
    return;
  }

  const spot = destination.lane.kind === "slot" ? "slot" : "spot";

  throw new Error(
    `${targetCount} clips can't share one ${spot}; give one toPath per clip, ` +
      `or a bare [pos] to keep each clip's own track`,
  );
}

/**
 * Refuse start/length next to duplicateLoop. They set the loop region, which is
 * exactly what duplicate_loop copies, so the call reads two ways - "the region
 * to double" or "the length to end up at" - and both look like success, since
 * the note count doubles either way. Two calls say which (ADR-0040). firstStart
 * still composes: it moves the playback marker, not the region.
 * @param start - Loop region start, if sent
 * @param length - Loop region length, if sent
 * @param duplicateLoop - Whether to double the loop
 */
export function refuseRegionWithDuplicateLoop(
  start: string | undefined,
  length: string | undefined,
  duplicateLoop: boolean | undefined,
): void {
  if (!duplicateLoop) {
    return;
  }

  const sent = [
    start != null ? "start" : null,
    length != null ? "length" : null,
  ].filter((param) => param != null);

  if (sent.length === 0) {
    return;
  }

  const named = sent.join("/");
  const verb = sent.length > 1 ? "set" : "sets";

  // The whole-clip double is the common case, so it goes first: a model told
  // "send two calls" first reads that as the instruction and sets the region
  // it never wanted, landing on twice the length all over again.
  throw new Error(
    `duplicateLoop cannot be combined with ${sent.join(" or ")}: ${named} ` +
      `${verb} the loop region, which is exactly what duplicateLoop doubles. ` +
      `To double the whole clip, send duplicateLoop on its own. To double just ` +
      `part of it, send ${named} in a separate call first.`,
  );
}

/** What a split can't be sent with, as the caller wrote them. */
export interface SplitMoveArgs {
  arrangementSplit?: string;
  /** Deprecated split spelling */
  split?: string;
  toPath?: string;
  /** Deprecated destination spelling */
  toSlot?: string;
  arrangementStart?: string;
  arrangementLength?: string;
}

/**
 * Refuse a split sent with a destination, a position, or a length.
 *
 * A split turns one clip into several, and Live keeps only the first piece on
 * the id that was named. A list pairs 1:1 with the ids the call named, so it
 * reaches that first piece and no other, and most of the request silently
 * doesn't happen. A single value is worse, because it reaches every piece:
 * one arrangementStart stacks them all on one bar, and one arrangementLength
 * longer than a piece tiles each piece over the next - the pieces a split
 * makes are adjacent, so that collision is certain, and a duplicate landing on
 * an arrangement clip destroys it. Nothing here is a reading of the call, so
 * nothing is cut and the caller sends two calls instead.
 *
 * Telling the safe lengths from the destructive ones needs each piece's own
 * length, which needs a Live read - and this has to answer before the first
 * one, so a refused call has changed nothing.
 * @param args - The split, destination and position params as received
 * @param args.arrangementSplit - Song-timeline split positions, if sent
 * @param args.split - Deprecated clip-relative split positions, if sent
 * @param args.toPath - Destination path(s), if sent
 * @param args.toSlot - Deprecated destination slot(s), if sent
 * @param args.arrangementStart - Position(s), if sent
 * @param args.arrangementLength - Span duration(s), if sent
 */
export function refuseSplitWithMove({
  arrangementSplit,
  split,
  toPath,
  toSlot,
  arrangementStart,
  arrangementLength,
}: SplitMoveArgs): void {
  const splitParam = namedSplitParam(arrangementSplit, split);

  if (splitParam == null) {
    return;
  }

  const conflicts = [
    paramNamesSomething(toPath) ? "toPath" : null,
    // The same emptiness test every other reader of the hidden param uses: an
    // all-empty value names nothing, and refusing it refuses a call that had
    // no conflict.
    pathNamesSomething(toSlot) ? "toSlot" : null,
    paramNamesSomething(arrangementStart) ? "arrangementStart" : null,
    paramNamesSomething(arrangementLength) ? "arrangementLength" : null,
  ].filter((param) => param != null);

  if (conflicts.length === 0) {
    return;
  }

  // "pairs", not "pair": subjects joined by "or" take the nearer one.
  const named = conflicts.join(" or ");

  throw new Error(
    `${splitParam} cannot be combined with ${named}: the split makes new ` +
      `clips, and ${named} pairs 1:1 with the clips this call names, while a ` +
      `single value covers every one of them. The new pieces either miss it ` +
      `or all take it, and neither is the call you wrote. Send ${splitParam} ` +
      `on its own, then ${named} in a second call, on the ids the split ` +
      `returns.`,
  );
}

/**
 * Which split param the call used, preferring the published spelling.
 * @param arrangementSplit - Song-timeline split positions, if sent
 * @param split - Deprecated clip-relative split positions, if sent
 * @returns The param name, or null when neither names a position
 */
function namedSplitParam(
  arrangementSplit: string | undefined,
  split: string | undefined,
): string | null {
  if (paramNamesSomething(arrangementSplit)) {
    return "arrangementSplit";
  }

  return paramNamesSomething(split) ? "split" : null;
}

/**
 * Refuse a whole-call param the tool can't read, before any clip is touched.
 *
 * These are one value for every clip in the call, so a per-clip skip would
 * repeat the same message down the list - and the per-clip warn-and-skip
 * wrapper would swallow a throw from inside the loop.
 * @param timeSignature - Time signature to apply, if given
 * @param quantizePitch - Pitch to limit quantization to, if given
 */
function validateWholeCallParams(
  timeSignature: string | undefined,
  quantizePitch: string | undefined,
): void {
  if (timeSignature != null) {
    parseTimeSignature(timeSignature);
  }

  if (quantizePitch != null && noteNameToMidi(quantizePitch) == null) {
    throw new Error(`invalid note name "${quantizePitch}" for quantizePitch`);
  }
}
