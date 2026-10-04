// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a clip's own entry says when its update didn't go as asked. Anything
// about a clip the call named belongs there, never in a warning, so
// the helpers that find out collect it here and the update loop puts it on the
// entry they wrote.
//
// A clip updated but not as asked keeps its entry and a detail; one whose only
// work was refused keeps its slot as a skip — `refuseClipWork` marks that, and
// so does `ignoreClipParams`, since an ignored param stops counting as work.
// Everything is keyed by the clip's id as the call found it; a step writing
// under a new id hands its reasons back with {@link moveClipReasons}.

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { type ClipReporter } from "#src/tools/shared/arrangement/helpers/clip-reporter.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { readBackDetail } from "#src/tools/shared/helpers/read-back-comparison.ts";
import { clipOverwriteNote } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { type LandedColor } from "#src/tools/shared/helpers/landed-color.ts";

/** What the clips of one call have to say beyond their own results. */
export interface ClipReasons {
  /** What each clip has to say, by the id the call found it at. */
  said: Map<string, string[]>;
  /** Clips whose requested work didn't happen at all. */
  refused: Set<string>;
  /** Clips something else the call asked for did land on. */
  landed: Set<string>;
  /** Params that did nothing on a clip, by that clip's id. */
  ignoredParams: Map<string, Set<string>>;
  /** The color a clip ended up with, when it isn't the one asked for. */
  colors: Map<string, string>;
  /** The take lanes a clip's move made on the way ("l1-l3"), and their track. */
  created: Map<string, { lanes: string; trackIndex: number }>;
  /** The values Live kept in place of the ones asked for, by the entry field
   * that reports them (`start`, `gainDb`, ...). */
  readBacks: Map<string, Record<string, number | string>>;
  /**
   * Where the target being written says what has landed, so a throw later in
   * its update keeps the entry for what exists by then. Set per target.
   */
  journal?: (phrase: string, partial?: Record<string, unknown>) => void;
}

/** Shared empty answer for a clip that ignored nothing. */
const NO_PARAMS: ReadonlySet<string> = new Set<string>();

/**
 * The collector one call's clips report through.
 * @returns An empty collector
 */
export function newClipReasons(): ClipReasons {
  return {
    said: new Map(),
    refused: new Set(),
    landed: new Set(),
    ignoredParams: new Map(),
    colors: new Map(),
    created: new Map(),
    readBacks: new Map(),
  };
}

/**
 * Say that something of the target being written has changed Live. A throw
 * after this keeps the target's entry, with a detail naming what landed.
 * @param reasons - What each clip has to say, which carries the journal
 * @param phrase - What landed, in a few words
 * @param partial - Entry fields known now (the id and path of what exists)
 */
export function noteLanded(
  reasons: ClipReasons,
  phrase: string,
  partial?: Record<string, unknown>,
): void {
  reasons.journal?.(phrase, partial);
}

/**
 * Say that a clip's move made take lanes. Lanes can't be deleted, so they are
 * reported whatever the move then does, and the clip's entry stays a real one
 * even when the move itself is refused.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 * @param created - The lanes made ("l1-l3")
 * @param trackIndex - The track they are on
 */
export function noteTakeLanesMade(
  reasons: ClipReasons,
  clipId: string,
  created: string,
  trackIndex: number,
): void {
  reasons.created.set(clipId, { lanes: created, trackIndex });
  markClipLanded(reasons, clipId);
  noteLanded(reasons, `take lane ${created} made`, { id: clipId, created });
}

/**
 * Note why one clip's update didn't go as asked, where something landed anyway.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 * @param reason - What happened instead, as the clip's entry will read it
 */
export function noteClipReason(
  reasons: ClipReasons,
  clipId: string,
  reason: string,
): void {
  reasons.said.set(clipId, [...(reasons.said.get(clipId) ?? []), reason]);
}

/**
 * Note the values Live kept in place of the ones this clip was asked for. They
 * go on the entry under the field they were asked in, and one detail names them
 * all, however many writes found one.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 * @param shown - The kept values, by entry field; nothing to do when empty
 */
export function noteClipReadBack(
  reasons: ClipReasons,
  clipId: string,
  shown: Record<string, number | string>,
): void {
  if (Object.keys(shown).length > 0) {
    reasons.readBacks.set(clipId, {
      ...reasons.readBacks.get(clipId),
      ...shown,
    });
  }
}

/**
 * A reporter for the shared arrangement steps, which own no entries of their
 * own. Splitting and tiling report through it instead of warning.
 * @param reasons - What each clip has to say, added to
 * @returns The reporter to put on the step's context
 */
export function clipReporterFor(reasons: ClipReasons): ClipReporter {
  return {
    note: (clipId, reason) => noteClipReason(reasons, clipId, reason),
    refuse: (clipId, reason) => refuseClipWork(reasons, clipId, reason),
  };
}

/**
 * Note the color Live settled on for this clip, when it isn't the one asked for.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 * @param landed - What the read-back after the write found
 */
export function noteClipColor(
  reasons: ClipReasons,
  clipId: string,
  landed: LandedColor,
): void {
  if (landed.detail != null) {
    noteClipReason(reasons, clipId, landed.detail);
  }

  if (landed.color != null) {
    reasons.colors.set(clipId, landed.color);
  }
}

/**
 * Note that the clip moved into a slot that already held one, which the move
 * replaced.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 * @param destPath - The slot it moved into
 */
export function noteClipOverwrite(
  reasons: ClipReasons,
  clipId: string,
  destPath: string,
): void {
  noteClipReason(reasons, clipId, clipOverwriteNote(destPath));
}

/**
 * Note that the work this clip was sent for didn't happen at all, so a call that
 * asked for nothing else has only the reason to report.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 * @param reason - Why it didn't happen, in the words a single clip would throw
 */
export function refuseClipWork(
  reasons: ClipReasons,
  clipId: string,
  reason: string,
): void {
  noteClipReason(reasons, clipId, reason);
  reasons.refused.add(clipId);
}

/**
 * Note that something the call asked for did land on this clip, so a refusal
 * beside it is a reason on a real entry rather than a skip.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 */
export function markClipLanded(reasons: ClipReasons, clipId: string): void {
  reasons.landed.add(clipId);
}

/**
 * Note that params the call sent did nothing on this clip, and refuse the work
 * they asked for. Naming them is what makes the refusal stick: the loop reads a
 * param the call sent as work asked of the clip, so an ignored one has to stop
 * counting or the clip looks updated.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 * @param params - The params that did nothing
 * @param reason - What happened instead, as the clip's entry will read it
 */
export function ignoreClipParams(
  reasons: ClipReasons,
  clipId: string,
  params: readonly string[],
  reason: string,
): void {
  refuseClipWork(reasons, clipId, reason);

  for (const param of params) {
    ignoreOneParam(reasons, clipId, param);
  }
}

/**
 * Add one param to what a clip ignored.
 * @param reasons - What each clip has to say, added to
 * @param clipId - The clip, by the id the call found it at
 * @param param - The param that did nothing
 */
function ignoreOneParam(
  reasons: ClipReasons,
  clipId: string,
  param: string,
): void {
  const ignored = reasons.ignoredParams.get(clipId) ?? new Set<string>();

  ignored.add(param);
  reasons.ignoredParams.set(clipId, ignored);
}

/**
 * The params that did nothing on one clip.
 * @param reasons - What each clip has to say
 * @param clipId - The clip, by the id the call found it at
 * @returns The param names, empty when everything the call sent had its say
 */
export function clipIgnoredParams(
  reasons: ClipReasons,
  clipId: string,
): ReadonlySet<string> {
  return reasons.ignoredParams.get(clipId) ?? NO_PARAMS;
}

/**
 * Whether nothing the call asked of this clip happened.
 * @param reasons - What each clip has to say
 * @param clipId - The clip, by the id the call found it at
 * @returns True when its work was refused and nothing else landed
 */
export function clipLandedNothing(
  reasons: ClipReasons,
  clipId: string,
): boolean {
  return reasons.refused.has(clipId) && !reasons.landed.has(clipId);
}

/**
 * Hand one clip's reasons over to another id, for a step that ran after a move
 * re-created the clip: they belong to the clip the caller named.
 * @param reasons - What each clip has to say, rewritten in place
 * @param fromId - The id the reasons were recorded under
 * @param toId - The id the call knows the clip by
 */
export function moveClipReasons(
  reasons: ClipReasons,
  fromId: string,
  toId: string,
): void {
  if (fromId === toId) {
    return;
  }

  for (const reason of reasons.said.get(fromId) ?? []) {
    noteClipReason(reasons, toId, reason);
  }

  reasons.said.delete(fromId);

  for (const param of reasons.ignoredParams.get(fromId) ?? []) {
    ignoreOneParam(reasons, toId, param);
  }

  reasons.ignoredParams.delete(fromId);

  const color = reasons.colors.get(fromId);

  if (color != null) {
    reasons.colors.set(toId, color);
    reasons.colors.delete(fromId);
  }

  const created = reasons.created.get(fromId);

  if (created != null) {
    reasons.created.set(toId, created);
    reasons.created.delete(fromId);
  }

  const readBack = reasons.readBacks.get(fromId);

  if (readBack != null) {
    reasons.readBacks.set(toId, readBack);
    reasons.readBacks.delete(fromId);
  }

  // `landed` needs no move: the loop marks it against the clip the caller named.
  if (reasons.refused.delete(fromId)) {
    reasons.refused.add(toId);
  }
}

/**
 * Put everything one clip's turn had to say onto the entry it wrote — the first,
 * since an arrangementLength tiles copies after it and the first is the clip the
 * target named.
 * @param reasons - What each clip has to say
 * @param clipId - The clip, by the id the call found it at
 * @param entry - The first entry that clip's turn wrote
 */
export function reportClipReasons(
  reasons: ClipReasons,
  clipId: string,
  entry: ClipResult,
): void {
  const color = reasons.colors.get(clipId);

  if (color != null) {
    entry.color = color;
  }

  const kept = reasons.readBacks.get(clipId) ?? {};

  Object.assign(entry, kept);

  for (const reason of reasons.said.get(clipId) ?? []) {
    appendDetail(entry, reason);
  }

  const made = reasons.created.get(clipId);

  if (made != null) {
    entry.created = made.lanes;

    // A move that didn't happen leaves the clip's own path on the entry, which
    // would read as lanes on that track. A path into the lanes' own track
    // already says where they are, so only the other case gets the words.
    if (!(entry.path ?? "").startsWith(`t${made.trackIndex}/l`)) {
      appendDetail(
        entry,
        `take ${made.lanes.includes("-") ? "lanes" : "lane"} ${made.lanes} made on t${made.trackIndex}`,
      );
    }
  }

  const detail = readBackDetail(
    READ_BACK_FIELDS.filter((field) => field in kept),
  );

  if (detail != null) {
    appendDetail(entry, detail);
  }
}

/** The fields a read-back can report, in the order the detail names them. */
const READ_BACK_FIELDS = [
  "start",
  "length",
  "timeSignature",
  "gainDb",
  "pitchShift",
  "warpMode",
];
