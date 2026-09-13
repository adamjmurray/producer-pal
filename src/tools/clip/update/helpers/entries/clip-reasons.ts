// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a clip's own entry says when its update didn't go as asked. Anything
// about a clip the call named belongs there, never in a warning (ADR-0042), so
// the helpers that find out collect it here and the update loop puts it on the
// entry they wrote.
//
// A clip updated but not as asked keeps its entry and a reason; one the call
// asked nothing else of and couldn't move at all keeps its slot as a skip —
// `refuseClipWork` marks that kind.
//
// Keyed by the clip's id as the call found it, which is what the loop looks up.
// A step writing under a new id (a move re-creates the clip) hands its reasons
// back with {@link moveClipReasons}.

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";

/** What the clips of one call have to say beyond their own results. */
export interface ClipReasons {
  /** What each clip has to say, by the id the call found it at. */
  said: Map<string, string[]>;
  /** Clips whose requested work didn't happen at all. */
  refused: Set<string>;
  /** Clips something else the call asked for did land on. */
  landed: Set<string>;
}

/**
 * The collector one call's clips report through.
 * @returns An empty collector
 */
export function newClipReasons(): ClipReasons {
  return { said: new Map(), refused: new Set(), landed: new Set() };
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

  // `landed` needs no move: the loop marks it against the clip the caller named.
  if (reasons.refused.delete(fromId)) {
    reasons.refused.add(toId);
  }
}

/**
 * Add to what an entry says, keeping anything already on it.
 * @param entry - The clip's entry in the result
 * @param reason - What to add
 */
export function appendReason(entry: ClipResult, reason: string): void {
  entry.reason = entry.reason == null ? reason : `${entry.reason}; ${reason}`;
}

/**
 * Put everything one clip's turn had to say onto the entry it wrote — the first,
 * since an arrangementLength tiles copies after it and the first is the clip the
 * target named.
 * @param reasons - What each clip has to say
 * @param clipId - The clip, by the id the call found it at
 * @param results - The entries that clip's turn wrote
 */
export function reportClipReasons(
  reasons: ClipReasons,
  clipId: string,
  results: ClipResult[],
): void {
  const entry = results[0];

  if (entry == null) {
    return;
  }

  for (const reason of reasons.said.get(clipId) ?? []) {
    appendReason(entry, reason);
  }
}
