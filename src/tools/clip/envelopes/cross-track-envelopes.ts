// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live's clip copy between tracks never carries device-parameter envelopes,
// even onto an identical device. Mixer envelopes (volume, pan, sends) survive,
// and a copy on the same track keeps everything. So a copy or move onto another
// track says which device envelopes it dropped, on the target's own entry.
//
// Session clips can be listed through the remote script, so their note names
// the envelopes; an arrangement clip's can't, so its note is hedged. A session
// clip's list is read before the copy, since a move deletes the source. The
// note is only said once the copy has landed.

import { envelopeIdentity } from "#src/tools/clip/read/helpers/clip-envelopes.ts";
import { envelopeRoute } from "#src/tools/clip/envelopes/envelope-route.ts";
import {
  type EnvelopeTrack,
  envelopeSlotOf,
  trackText,
} from "#src/tools/clip/envelopes/envelope-track.ts";
import {
  ENVELOPE_ROUTES,
  type EnvelopeListResult,
} from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { type SlotMap } from "#src/tools/shared/device/helpers/params/hosted-automation-slots.ts";
import {
  READ_DETAIL_MAX_WAIT_MS,
  WRITE_AFTER_READ_RESERVE_MS,
} from "#src/tools/shared/remote-script/remote-script-wait.ts";

/** What a note says when the envelopes can't be named. */
export const UNNAMED_ENVELOPE_LOSS =
  "any device envelopes were dropped, since they don't copy to another track";

/** What a call has learned about asking the remote script for envelope lists. */
export interface EnvelopeReads {
  /** A list didn't come back, so the rest of the call goes straight to the hedge */
  stalled: boolean;
}

/** What the remote script call needs from the request. */
export interface EnvelopeLossContext {
  deadline?: number | null;
  /** Whether the caller can use ppal-manage */
  manage: boolean;
  /** Kept by the call, so one stalled read spares every later one its wait */
  reads: EnvelopeReads;
}

/**
 * The note for a copy or move of a clip onto another track, or null when it
 * costs no device envelopes. Only looks when the destination is another track
 * and the clip has envelopes at all.
 * @param clip - The source clip, still in place
 * @param to - The track the copy lands on
 * @param context - The request's deadline, and whether ppal-manage is offered
 * @returns The note, or null
 */
export async function crossTrackEnvelopeLoss(
  clip: LiveAPI,
  to: EnvelopeTrack,
  context: EnvelopeLossContext,
): Promise<string | null> {
  return leavesTrack(clip, to) ? await droppedEnvelopes(clip, context) : null;
}

/**
 * @param clip - The source clip
 * @param to - The track a copy of it lands on
 * @returns Whether that is another track than the clip's own
 */
export function leavesTrack(clip: LiveAPI, to: EnvelopeTrack): boolean {
  const from = clipTrack(clip);

  return from != null && !(from.kind === to.kind && from.index === to.index);
}

/**
 * Like {@link crossTrackEnvelopeLoss}, for an arrangement clip: nothing is
 * read, so the answer is never a promise. A session clip gets null.
 * @param clip - The clip being copied
 * @param toTrackIndex - The track the copy lands on
 * @returns The hedged note, or null
 */
export function arrangementEnvelopeLoss(
  clip: LiveAPI,
  toTrackIndex: number,
): string | null {
  return (clip.getProperty("is_arrangement_clip") as number) > 0 &&
    clip.trackIndex !== toTrackIndex &&
    hasEnvelopes(clip)
    ? UNNAMED_ENVELOPE_LOSS
    : null;
}

/**
 * The source's device envelopes as a note, whatever the destination: the part
 * worth remembering across several copies of one clip.
 * @param clip - The source clip, still in place
 * @param context - The request's deadline, and whether ppal-manage is offered
 * @returns The note, or null
 */
export async function droppedEnvelopes(
  clip: LiveAPI,
  context: EnvelopeLossContext,
): Promise<string | null> {
  if (!hasEnvelopes(clip)) {
    return null;
  }

  const placed = envelopeSlotOf(clip);

  // An arrangement clip's envelopes can't be listed.
  if (placed == null || context.reads.stalled) {
    return UNNAMED_ENVELOPE_LOSS;
  }

  // Building the note must never block the copy it describes.
  try {
    return await listedLoss(placed.track, placed.slot, context);
  } catch {
    return UNNAMED_ENVELOPE_LOSS;
  }
}

// --- Helpers below main exports ---

/**
 * @param clip - Any clip
 * @returns Whether Live says it has envelopes (any kind)
 */
function hasEnvelopes(clip: LiveAPI): boolean {
  return (clip.getProperty("has_envelopes") as number) > 0;
}

/**
 * @param clip - Any clip
 * @returns The track it sits on, or null when it can't say
 */
function clipTrack(clip: LiveAPI): EnvelopeTrack | null {
  const placed = envelopeSlotOf(clip);

  if (placed != null) {
    return placed.track;
  }

  return clip.trackIndex == null
    ? null
    : { kind: "regular", index: clip.trackIndex };
}

/**
 * List a session clip's device envelopes, and say which are lost.
 * @param track - The clip's track
 * @param slot - The clip's scene index
 * @param context - The request's deadline, and whether ppal-manage is offered
 * @returns The note; hedged when the remote script can't list them
 */
async function listedLoss(
  track: EnvelopeTrack,
  slot: number,
  context: EnvelopeLossContext,
): Promise<string | null> {
  const listed = await envelopeRoute<EnvelopeListResult>(
    ENVELOPE_ROUTES.list,
    { track: trackText(track), slot },
    context.deadline,
    context.manage,
    READ_DETAIL_MAX_WAIT_MS,
    WRITE_AFTER_READ_RESERVE_MS,
  );

  if (!listed.ok) {
    // A missing, stalled or out-of-time route would fail the next call too.
    context.reads.stalled ||= !listed.available || listed.stalled != null;

    return UNNAMED_ENVELOPE_LOSS;
  }

  const wrappers = new Map<string, SlotMap | null>();
  const names = listed.result.envelopes
    .filter((entry) => entry.device != null)
    .map((entry) => {
      const { parameter } = envelopeIdentity(track, entry, wrappers);

      return `${parameter} (${trackText(track)}/${entry.device as string})`;
    });

  return names.length === 0
    ? null
    : `dropped the device envelopes, which don't copy to another track: ${names.join(", ")}`;
}
