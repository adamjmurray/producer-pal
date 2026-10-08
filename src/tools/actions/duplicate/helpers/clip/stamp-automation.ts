// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Copying a session clip to the arrangement writes its automation into the
// track's lane over the copy's own span. Copy it at another length and that
// lands in the wrong place (a shortened copy goes through the holding area) or
// stops short (a lengthened one is tiled from copies that carry none).
//
// So the lane is written first, by stamps: for each stretch of content the
// final copy will play, a scratch session copy is set to show just that and
// copied to its place on the arrangement, then the copy is deleted. The lane
// keeps what the copy wrote. The clip itself is then placed from an
// envelope-free scratch copy, so nothing it does touches the lane again.

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { isDeadlineExceeded } from "#src/shared/max/v8-request-deadline.ts";
import { clipFromDuplicateResult } from "#src/tools/shared/arrangement/helpers/arrangement-duplicate-result.ts";
import {
  openScratchSlot,
  removeSessionClip,
  type ScratchSessionSlot,
  type TilingContext,
} from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { clipRegionWrites } from "#src/tools/shared/clip/clip-region-writes.ts";
import { copyClipToSlot } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  appendDetail,
  joinDetails,
} from "#src/tools/shared/helpers/entry-details.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { type MinimalClipInfo } from "../minimal-clip-info.ts";
import { contentSegments, type ContentSegment } from "./content-segments.ts";

type StampContext = Partial<ToolContext & TilingContext>;

/** What to stamp, and where. */
export interface StampRequest {
  /** The session clip being copied */
  source: LiveAPI;
  /** The destination track */
  track: LiveAPI;
  startBeats: number;
  lengthBeats: number;
  context: StampContext;
}

/** How far the lane got, kept outside the run so a failure can still say. */
interface Stamped {
  /** Beats of the copy's span the lane was written for */
  beats: number;
  /** Why the stamping stopped early */
  problem?: string;
}

/**
 * Whether copying this session clip at this length would put its automation in
 * the wrong place. MIDI and warped audio carry automation; an unwarped clip's
 * never plays, and a copy at the clip's own length writes the lane correctly.
 * `has_envelopes` is Live's own flag (true for any envelope), so a clip without
 * one costs no stamps.
 * @param source - The clip being copied
 * @param lengthBeats - The length asked for
 * @param sourceLengthBeats - The length a plain copy would have
 * @returns True when the lane needs stamping
 */
export function carriesAutomation(
  source: LiveAPI,
  lengthBeats: number,
  sourceLengthBeats: number,
): boolean {
  return (
    source.getProperty("is_arrangement_clip") !== 1 &&
    lengthBeats !== sourceLengthBeats &&
    (source.getProperty("has_envelopes") as number) > 0 &&
    (source.getProperty("is_midi_clip") === 1 ||
      source.getProperty("warping") === 1) &&
    source.trackIndex != null &&
    source.sceneIndex != null
  );
}

/**
 * Write a session clip's automation to the lane over `lengthBeats`, then place
 * the clip from an envelope-free copy. The scratch copy is always removed.
 * What the stamping couldn't do goes on the first clip's entry; a failure after
 * the lane changed says so.
 * @param request - What to stamp, and where
 * @param place - Places the clip from the envelope-free copy it is handed
 * @returns The placed clips
 */
export async function stampAutomation(
  request: StampRequest,
  place: (envelopeFree: LiveAPI) => Promise<MinimalClipInfo[]>,
): Promise<MinimalClipInfo[]> {
  const { lengthBeats, context } = request;
  const stamped: Stamped = { beats: 0 };
  const notes: string[] = [];
  const report = context.reportScratch ?? ((message) => notes.push(message));
  let placed: MinimalClipInfo[];

  try {
    const scratch = openScratchSlot(request.track, report);

    try {
      placed = await stampThenPlace(request, scratch, stamped, place);
    } finally {
      removeSessionClip(scratch, report);
    }
  } catch (error) {
    throw failureWithChanges(error, stamped, lengthBeats, notes);
  }

  const [first] = placed;

  if (first != null) {
    const said = joinDetails([stampNote(stamped, lengthBeats), ...notes]);

    if (said != null) {
      appendDetail(first, said);
    }

    return placed;
  }

  // No clip to carry what happened, so the failure does.
  const changed = joinDetails([changesNote(stamped, lengthBeats), ...notes]);

  if (changed != null) {
    throw new Error(`Live made no copy there; ${changed}`);
  }

  return placed;
}

// --- Helpers below main exports ---

/**
 * Stamp the lane, then hand `place` a fresh copy with the envelopes cleared.
 * @param request - What to stamp, and where
 * @param scratch - The slot for the scratch copies
 * @param stamped - Filled in as the lane is written
 * @param place - Places the clip from the envelope-free copy
 * @returns The placed clips
 */
async function stampThenPlace(
  request: StampRequest,
  scratch: ScratchSessionSlot,
  stamped: Stamped,
  place: (envelopeFree: LiveAPI) => Promise<MinimalClipInfo[]>,
): Promise<MinimalClipInfo[]> {
  const { source, track, startBeats, lengthBeats, context } = request;
  const sourceSlot = LiveAPI.from(
    livePath
      .track(source.trackIndex as number)
      .clipSlot(source.sceneIndex as number),
  );

  const copyToScratch = (): LiveAPI => {
    const copy = copyClipToSlot(sourceSlot, scratch.slot);

    if (copy == null) {
      throw new Error(
        "Live made no scratch copy of the clip, so its automation can't be carried over",
      );
    }

    return copy;
  };

  const carrier = copyToScratch();

  // The stamps clear whatever sits under the copy, as the copy itself would.
  context.lanes?.wroteOnTrack(track, startBeats, startBeats + lengthBeats);
  stampLane(request, carrier, stamped);

  // Fresh markers, since the stamps moved them; the envelopes go last.
  const envelopeFree = copyToScratch();

  envelopeFree.call("clear_all_envelopes");

  return await place(envelopeFree);
}

/**
 * Stamp each stretch of content. A failure or the deadline stops it where it
 * is, and says so in `stamped`: the clip is still placed.
 * @param request - What to stamp, and where
 * @param carrier - The scratch copy the stamps are taken from
 * @param stamped - Filled in as the lane is written
 */
function stampLane(
  request: StampRequest,
  carrier: LiveAPI,
  stamped: Stamped,
): void {
  const { source, startBeats, lengthBeats, context } = request;
  const looping = (source.getProperty("looping") as number) > 0;
  const segments = contentSegments(
    {
      looping,
      loopStart: source.getProperty("loop_start") as number,
      loopEnd: source.getProperty("loop_end") as number,
      startMarker: source.getProperty("start_marker") as number,
    },
    lengthBeats,
  );
  const region: Region = {
    loop_start: carrier.getProperty("loop_start") as number,
    loop_end: carrier.getProperty("loop_end") as number,
    start_marker: carrier.getProperty("start_marker") as number,
    end_marker: carrier.getProperty("end_marker") as number,
  };

  for (const segment of segments) {
    if (isDeadlineExceeded(context.deadline ?? null)) {
      stamped.problem = "ran out of time";

      return;
    }

    try {
      showContent(carrier, looping, segment, region);

      const copy = copyStamp(
        request.track,
        carrier.id,
        startBeats + segment.at,
      );

      // The lane has it once the copy exists, whether or not it can be deleted.
      stamped.beats = segment.at + (segment.to - segment.from);
      deleteStamp(request.track, copy, startBeats + segment.at);
    } catch (error) {
      stamped.problem = errorMessage(error);

      return;
    }
  }
}

/** The markers a scratch copy has now, kept up to date as they are written. */
interface Region {
  loop_start: number;
  loop_end: number;
  start_marker: number;
  end_marker: number;
}

/**
 * Set the scratch copy to show exactly one stretch of content, unless it
 * already does (whole loops repeat the same one). A looped clip takes its loop
 * and markers, an unlooped one its start marker and loop end; `looping` is never
 * toggled, which would reset a warped clip's loop end.
 * @param carrier - The scratch copy
 * @param looping - Whether the clip is looped
 * @param segment - The content to show
 * @param region - The markers the copy has now, updated to match
 */
function showContent(
  carrier: LiveAPI,
  looping: boolean,
  segment: ContentSegment,
  region: Region,
): void {
  const { from, to } = segment;

  if (looping) {
    if (
      region.loop_start === from &&
      region.loop_end === to &&
      region.start_marker === from &&
      region.end_marker === to
    ) {
      return;
    }

    carrier.setAll({
      ...clipRegionWrites(region, {
        loop_start: from,
        loop_end: to,
        start_marker: from,
        end_marker: to,
      }),
    });
    Object.assign(region, {
      loop_start: from,
      loop_end: to,
      start_marker: from,
      end_marker: to,
    });

    return;
  }

  if (region.start_marker === from && region.loop_end === to) {
    return;
  }

  // The start moves first, unless it lands at or past the current end. A
  // longer end takes the end marker along, as lengthening an unlooped clip does.
  carrier.setAll({
    ...(to > region.end_marker && { end_marker: to }),
    ...(from >= region.loop_end
      ? { loop_end: to, start_marker: from }
      : { start_marker: from, loop_end: to }),
  });
  Object.assign(region, {
    start_marker: from,
    loop_end: to,
    end_marker: Math.max(region.end_marker, to),
  });
}

/**
 * Copy the scratch copy to the arrangement: the lane takes what it writes.
 * @param track - The destination track
 * @param carrierId - The scratch copy's id
 * @param at - Where on the arrangement, in beats
 * @returns The copy
 */
function copyStamp(track: LiveAPI, carrierId: string, at: number): LiveAPI {
  // Arrangement edits leave a track object stale, so each stamp starts fresh.
  const fresh = LiveAPI.from(livePath.track(track.trackIndex as number));
  const copy = clipFromDuplicateResult(
    fresh.call("duplicate_clip_to_arrangement", toLiveApiId(carrierId), at),
  );

  if (!copy.exists()) {
    throw new Error(`Live made no copy at ${beatsText(at)} beats`);
  }

  return copy;
}

/**
 * Delete a stamp's copy at once: the lane keeps what the copy wrote.
 * @param track - The destination track
 * @param copy - The copy
 * @param at - Where it sits, in beats
 */
function deleteStamp(track: LiveAPI, copy: LiveAPI, at: number): void {
  try {
    LiveAPI.from(livePath.track(track.trackIndex as number)).call(
      "delete_clip",
      toLiveApiId(copy.id),
    );
  } catch (error) {
    throw new Error(
      `couldn't delete a scratch copy at ${beatsText(at)} beats (${errorMessage(error)})`,
      { cause: error },
    );
  }
}

/**
 * What the lane got, in words.
 * @param stamped - How far the stamping got
 * @param lengthBeats - The length it was after
 * @returns The account, or undefined when nothing was stamped and nothing went wrong
 */
function laneNote(stamped: Stamped, lengthBeats: number): string | undefined {
  if (stamped.beats <= 0) {
    return stamped.problem == null
      ? undefined
      : `automation not written (${stamped.problem})`;
  }

  return stamped.problem == null
    ? `automation written for all ${beatsText(lengthBeats)} beats`
    : `automation written for the first ${beatsText(stamped.beats)} of ${beatsText(lengthBeats)} beats only (${stamped.problem})`;
}

/**
 * What the lane was left with, when the stamping didn't finish.
 * @param stamped - How far the stamping got
 * @param lengthBeats - The length it was after
 * @returns The note for the clip's entry, or undefined when it finished
 */
function stampNote(stamped: Stamped, lengthBeats: number): string | undefined {
  return stamped.problem == null ? undefined : laneNote(stamped, lengthBeats);
}

/**
 * What the stamping changed, for a failure that came after it.
 * @param stamped - How far the stamping got
 * @param lengthBeats - The length it was after
 * @returns The note, or undefined when there is nothing to say
 */
function changesNote(
  stamped: Stamped,
  lengthBeats: number,
): string | undefined {
  const note = laneNote(stamped, lengthBeats);

  return note != null && stamped.beats > 0 ? `already changed: ${note}` : note;
}

/**
 * The error to throw for a failure during stamping or placing: the original,
 * with what had already changed and what couldn't be cleaned up.
 * @param error - What was thrown
 * @param stamped - How far the stamping got
 * @param lengthBeats - The length it was after
 * @param notes - What couldn't be removed
 * @returns The original error when there is nothing to add
 */
function failureWithChanges(
  error: unknown,
  stamped: Stamped,
  lengthBeats: number,
  notes: string[],
): unknown {
  const extra = joinDetails([changesNote(stamped, lengthBeats), ...notes]);

  return extra == null
    ? error
    : new Error(`${errorMessage(error)}; ${extra}`, { cause: error });
}

/**
 * @param beats - A position or length
 * @returns The number without float noise
 */
function beatsText(beats: number): string {
  return String(Number(beats.toFixed(3)));
}
