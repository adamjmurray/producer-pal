// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The `envelopes` param on an arrangement clip. An arrangement clip has no
// envelopes of its own: its automation is the track's lane. So the lines are
// written into an empty scratch session clip as long as the clip, and that is
// stamped onto the lane over the clip's span (see stamp-clip-lane.ts). Times
// run from where the clip starts, once through, however the clip loops. The
// scratch clip is MIDI on a MIDI track; on an audio track it is a warped
// silent clip, which is what plays its envelopes (the arrangement clip's own
// warping doesn't matter, since the lane belongs to the track).

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { isDeadlineExceeded } from "#src/shared/max/v8-request-deadline.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  createAudioClipInSession,
  openScratchSlot,
  removeSessionClip,
  type SessionClipResult,
} from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type EnvelopeLine } from "../envelope-lines.ts";
import {
  canWriteEnvelopePoints,
  type ClipAddress,
  writeEachLine,
} from "../write-envelope-lines.ts";
import { stampClipLane } from "./stamp-clip-lane.ts";

/** Why an audio clip can't be given a lane without the silence file. */
const NO_SILENCE_REFUSAL =
  "not written: an audio clip's lane is written through a silent audio clip, and the silence file isn't available";

/** Why a take-lane clip takes no envelopes. */
const TAKE_LANE_REFUSAL =
  "only a clip on a track's main arrangement lane can take envelopes; move it there first";

/**
 * Write an arrangement clip's automation to the track's lane over the
 * clip's span, reporting on the clip's entry. The clip is re-created, so the
 * entry carries its new id.
 *
 * Nothing here throws. A line that can't be written, an empty line (a lane
 * can't be cleared) and a failure at any step are details on the entry, which
 * says what changed and where the clip is.
 * @param entry - The clip's result entry, written to
 * @param lines - The `envelopes` param, already read into lines
 * @param context - The call's deadline, arrangement lane view and silence file
 */
export async function applyArrangementEnvelopes(
  entry: ClipResult,
  lines: readonly EnvelopeLine[],
  context: Pick<ToolContext, "deadline" | "lanes" | "silenceWavPath">,
): Promise<void> {
  const clip = LiveAPI.from(entry.id);
  const isAudio = (clip.getProperty("is_audio_clip") as number) > 0;
  const refusal = refusalFor(clip, isAudio, context.silenceWavPath);

  if (refusal != null) {
    entry.envelopes = refusal;

    return;
  }

  const trackIndex = clip.trackIndex as number;
  const startBeats = clip.getProperty("start_time") as number;
  const endBeats = clip.getProperty("end_time") as number;
  const meter = {
    timeSigNumerator: clip.getProperty("signature_numerator") as number,
    timeSigDenominator: clip.getProperty("signature_denominator") as number,
  };
  const report = (message: string): void => appendDetail(entry, message);
  let scratch: ScratchClip | undefined;
  let carrierId: string | undefined;

  try {
    const track = LiveAPI.from(livePath.track(trackIndex));

    scratch = isAudio
      ? createAudioClipInSession(
          track,
          endBeats - startBeats,
          context.silenceWavPath as string,
          report,
        )
      : openScratchSlot(track, report);
    carrierId = await fillCarrier(entry, lines, context, {
      scratch,
      isAudio,
      trackIndex,
      lengthBeats: endBeats - startBeats,
      meter,
    });
  } catch (error) {
    // Only the scratch clip has been touched.
    entry.envelopes = 0;
    unchanged(entry, errorMessage(error));
  }

  try {
    if (carrierId != null) {
      stampClipLane(
        entry,
        { clipId: entry.id, trackIndex, startBeats, endBeats, carrierId },
        context,
      );
    }
  } finally {
    if (scratch != null) {
      removeSessionClip(scratch, report);
    }
  }
}

// --- Helpers below main exports ---

/**
 * Why this clip can't take envelopes, before anything is touched.
 * @param clip - The arrangement clip
 * @param isAudio - Whether it is an audio clip
 * @param silenceWavPath - The silent audio file an audio clip's scratch clip is made from
 * @returns The reason, or undefined when it can
 */
function refusalFor(
  clip: LiveAPI,
  isAudio: boolean,
  silenceWavPath: string | undefined,
): string | undefined {
  if (isAudio && silenceWavPath == null) {
    return NO_SILENCE_REFUSAL;
  }

  if (isTakeLaneClip(clip)) {
    return TAKE_LANE_REFUSAL;
  }

  const blocker = clipCopyBlocker(!isAudio, clip.trackIndex as number);

  return blocker == null ? undefined : `not written: ${blocker}`;
}

/** The slot the scratch clip is in, and the scene made for it if any. */
type ScratchClip = Pick<SessionClipResult, "slot" | "sceneId">;

/** What the scratch clip is made from. */
interface CarrierRequest {
  scratch: ScratchClip;
  /** An audio clip's scratch clip is already made; a MIDI one is made here */
  isAudio: boolean;
  trackIndex: number;
  /** The arrangement clip's length, which the scratch clip matches */
  lengthBeats: number;
  /** The arrangement clip's meter, which the lines' times are spelled in */
  meter: Pick<ClipAddress, "timeSigNumerator" | "timeSigDenominator">;
}

/**
 * Make the scratch clip and write the lines into it. Nothing in the Set but the
 * scratch clip has changed when this returns, whatever it returns.
 * @param entry - The clip's result entry, written to
 * @param lines - The `envelopes` param, already read into lines
 * @param context - The call's deadline
 * @param request - The scratch slot and the clip it stands in for
 * @returns The scratch clip's id, or undefined when there is nothing to stamp
 */
async function fillCarrier(
  entry: ClipResult,
  lines: readonly EnvelopeLine[],
  context: Pick<ToolContext, "deadline">,
  request: CarrierRequest,
): Promise<string | undefined> {
  const { scratch, isAudio, trackIndex, lengthBeats, meter } = request;

  if (!isAudio) {
    scratch.slot.call("create_clip", lengthBeats);
  }

  const carrier = scratch.slot.child("clip");

  if (!carrier.exists()) {
    throw new Error("Live made no scratch clip");
  }

  const carrierId = carrier.id;
  const written = await writeEachLine(
    entry,
    lines,
    {
      trackIndex,
      slot: carrier.clipSlotIndex as number,
      ...meter,
      endBeats: lengthBeats,
      unwarped: false,
      canWritePoints: canWriteEnvelopePoints(),
      carrier: true,
    },
    context.deadline,
  );

  // A line's own reason is on the entry; a call that wrote none says the rest.
  if (written === 0) {
    if (entry.envelopes === 0) {
      appendDetail(entry, "the clip and its lane are unchanged");
    }

    return undefined;
  }

  // Once the clip is parked it is put back whatever the time, so this is the
  // last place to stop with nothing changed.
  if (isDeadlineExceeded(context.deadline ?? null)) {
    entry.envelopes = 0;
    unchanged(entry, `${REQUEST_OUT_OF_TIME}; re-run for this clip`);

    return undefined;
  }

  return carrierId;
}

/**
 * Say nothing was written and neither the clip nor its lane changed.
 * @param entry - The clip's result entry, written to
 * @param why - What stopped it
 */
function unchanged(entry: ClipResult, why: string): void {
  appendDetail(
    entry,
    `not written to the lane: ${why}; the clip and its lane are unchanged`,
  );
}
